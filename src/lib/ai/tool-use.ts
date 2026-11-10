/**
 * Letting Claude do things in this app, not just talk about them.
 *
 * Until now every AI feature here was one question in and one block of text
 * out. That is the right shape for "explain osmosis" and the wrong shape for
 * "I've got a biology test on the 12th" — the tutor would answer well, and
 * the exam would still not be in the app, because the only hands in the room
 * belonged to the student.
 *
 * A tool is a function this app already has, described well enough for the
 * model to ask for it by name. The model never runs anything: it says which
 * tool and with what, this file's loop runs ours, and the result goes back as
 * another turn. So the blast radius is exactly the set of functions handed in
 * — nothing is eval'd, no code arrives from the API, and the user id every
 * tool writes under is the signed-in one, closed over at the call site, never
 * a value the model can name.
 *
 * Kept separate from the provider so the parts worth testing — what a tool
 * definition looks like on the wire, and how a model-supplied argument is
 * read — can be tested without a network at all.
 */

/** What a tool says back: one sentence the model (and a person) can read. */
export type ToolOutcome = { ok: boolean; message: string };

export type ToolSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
};

export type ProviderTool = {
  /** Snake case, as the API wants it, and as the model will say it back. */
  name: string;
  description: string;
  schema: ToolSchema;
  run(input: Record<string, unknown>): Promise<ToolOutcome>;
};

/**
 * How many times one question may come back asking for another tool.
 *
 * Each round is a whole extra request, so the ceiling is a spend limit as
 * much as a loop guard. Six is enough for the real sequences here ("find the
 * subject, add the exam, make three cards about it") and nowhere near enough
 * to go round forever on a tool that keeps failing.
 */
export const MAX_TOOL_ROUNDS = 6;

/**
 * A JSON Schema the API will accept under `strict`.
 *
 * `additionalProperties: false` and a complete `required` list are what
 * strict mode means: without them the request is refused, and the refusal
 * names the schema rather than the tool that built it.
 *
 * Strict mode takes a subset of JSON Schema, and the omissions are easy to
 * trip over: `minimum`, `maximum`, `minLength` and friends are not in it. So
 * a range lives in the description, where the model reads it, and is checked
 * again in the tool, where it is enforced.
 */
export function objectSchema(properties: Record<string, unknown>): ToolSchema {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

/**
 * A string argument, or null when the model chose to leave it out.
 *
 * Written as `anyOf` rather than as `type: ["string", "null"]`, and the
 * difference matters: strict mode accepts a documented subset of JSON Schema,
 * `anyOf` is in it, and a schema it does not accept is a 400 on every
 * tool-carrying request the app makes.
 *
 * Optional arguments still appear in `required` — strict mode wants every
 * property listed — so "leave it out" is spelled by sending null.
 */
export function optionalString(description: string) {
  return { anyOf: [{ type: "string" }, { type: "null" }], description };
}

export function requiredString(description: string) {
  return { type: "string", description };
}

/**
 * The tools a caller handed in, with anything malformed dropped.
 *
 * They travel in the same loose context bag as the system prompt and the
 * photos, because that is the one argument every provider call site already
 * passes. A half-built tool sent to the API comes back as a 400 about a
 * schema, naming nothing that would lead you to the call site.
 */
export function collectTools(context: Record<string, unknown>): ProviderTool[] {
  if (!Array.isArray(context.tools)) return [];
  const tools: ProviderTool[] = [];
  for (const entry of context.tools) {
    if (!entry || typeof entry !== "object") continue;
    const tool = entry as Partial<ProviderTool>;
    if (typeof tool.name !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(tool.name)) continue;
    if (typeof tool.description !== "string" || !tool.description.trim()) continue;
    if (typeof tool.run !== "function") continue;
    if (!tool.schema || tool.schema.type !== "object") continue;
    // Two tools of the same name is a 400, and the duplicate is usually a
    // list built twice rather than a real second tool.
    if (tools.some((kept) => kept.name === tool.name)) continue;
    tools.push(tool as ProviderTool);
  }
  return tools;
}

export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: ToolSchema;
  strict: true;
};

/**
 * The tools as the Messages API wants them.
 *
 * `strict: true` is the part worth having: without it the model may send a
 * field that is not in the schema, or miss one that is, and the code that
 * runs the tool then has to decide what a half-filled argument means. With
 * it, what arrives matches what was asked for.
 */
export function toolDefinitions(tools: ProviderTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.schema,
    strict: true,
  }));
}

/**
 * The arguments of a tool call, as an object.
 *
 * Always parsed, never matched on. The input of a `tool_use` block is
 * model-written JSON; reading a field out of it with a regex over the raw
 * text is how a tool ends up acting on a value that was never there.
 */
export function parseToolInput(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** A trimmed string argument, or null — "null", "" and a number are all null. */
export function readString(input: Record<string, unknown>, key: string, maxChars = 400): string | null {
  const value = input[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed.slice(0, maxChars);
}

/**
 * A date argument, read as a plain calendar day in local time.
 *
 * `new Date("2026-03-12")` is midnight UTC, which is the evening of the 11th
 * for anyone west of Greenwich — an exam added for the 12th would show up on
 * the day before. Read field by field instead, so the day the model wrote is
 * the day that is stored.
 */
export function readDay(input: Record<string, unknown>, key: string): Date | null {
  const raw = readString(input, key, 40);
  const match = raw?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  // A year outside this range is a model mistake, not a plan.
  if (date.getFullYear() < 2000 || date.getFullYear() > 2100) return null;
  return date;
}

/** A list argument, with non-objects dropped. */
export function readObjects(input: Record<string, unknown>, key: string, max: number): Record<string, unknown>[] {
  const value = input[key];
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
    .slice(0, max);
}
