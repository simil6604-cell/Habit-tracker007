import { describe, expect, it } from "vitest";
import {
  collectTools,
  MAX_TOOL_ROUNDS,
  objectSchema,
  optionalString,
  parseToolInput,
  readDay,
  readObjects,
  readString,
  toolDefinitions,
  type ProviderTool,
} from "@/lib/ai/tool-use";
import { schoolAITools } from "@/lib/school/ai-tools";

function tool(overrides: Partial<ProviderTool> = {}): ProviderTool {
  return {
    name: "add_exam",
    description: "Adds an exam.",
    schema: objectSchema({ title: { type: "string" } }),
    run: async () => ({ ok: true, message: "done" }),
    ...overrides,
  } as ProviderTool;
}

describe("a tool definition on the wire", () => {
  it("carries strict mode, with the schema strict mode requires", () => {
    const [definition] = toolDefinitions([tool()]);
    expect(definition.strict).toBe(true);
    expect(definition.input_schema.additionalProperties).toBe(false);
    // Strict mode wants every property listed as required — optional ones
    // say so by accepting null, not by being left out.
    expect(definition.input_schema.required).toEqual(Object.keys(definition.input_schema.properties));
  });

  it("spells an optional argument as anyOf, not as a list of types", () => {
    // `type: ["string", "null"]` is not in the subset strict mode accepts,
    // and a schema it does not accept is a 400 on every request that carries
    // a tool — which is all of them, once the tutor has hands.
    expect(optionalString("a subject")).toEqual({
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "a subject",
    });
  });
});

describe("the tools a call site hands in", () => {
  it("drops a half-built tool rather than sending it", () => {
    const tools = collectTools({
      tools: [
        tool(),
        tool({ name: "Add Exam" }), // not snake case — the API refuses it
        tool({ run: undefined }),
        tool({ description: "   " }),
        tool({ schema: undefined }),
        null,
        "add_exam",
      ],
    });
    expect(tools.map((t) => t.name)).toEqual(["add_exam"]);
  });

  it("keeps one tool per name", () => {
    expect(collectTools({ tools: [tool(), tool()] })).toHaveLength(1);
  });

  it("is empty when nothing was handed in, so the request carries no tools at all", () => {
    expect(collectTools({})).toEqual([]);
    expect(collectTools({ tools: "add_exam" })).toEqual([]);
  });
});

describe("reading what the model sent", () => {
  it("parses the arguments, whether they arrive as an object or as JSON text", () => {
    expect(parseToolInput({ title: "Paper 2" })).toEqual({ title: "Paper 2" });
    expect(parseToolInput('{"title":"Paper 2"}')).toEqual({ title: "Paper 2" });
  });

  it("refuses anything that is not an object of arguments", () => {
    expect(parseToolInput("not json")).toBeNull();
    expect(parseToolInput("[1,2]")).toBeNull();
    expect(parseToolInput(null)).toBeNull();
    expect(parseToolInput(42)).toBeNull();
  });

  it("reads a string, and reads a left-out one as nothing", () => {
    const input = { a: " Biology ", b: "", c: "null", d: 7 };
    expect(readString(input, "a")).toBe("Biology");
    expect(readString(input, "b")).toBeNull();
    // Models write the word when the schema says the field may be null.
    expect(readString(input, "c")).toBeNull();
    expect(readString(input, "d")).toBeNull();
    expect(readString(input, "missing")).toBeNull();
  });

  it("caps a string rather than storing whatever arrived", () => {
    expect(readString({ a: "x".repeat(900) }, "a", 10)).toHaveLength(10);
  });

  it("reads a date as the calendar day it says, not as midnight UTC", () => {
    // `new Date("2026-03-12")` is the evening of the 11th anywhere west of
    // Greenwich, so an exam added for the 12th would show on the day before.
    const day = readDay({ date: "2026-03-12" }, "date")!;
    expect(day.getFullYear()).toBe(2026);
    expect(day.getMonth()).toBe(2);
    expect(day.getDate()).toBe(12);
  });

  it("refuses a date that is not one", () => {
    expect(readDay({ date: "next Tuesday" }, "date")).toBeNull();
    expect(readDay({ date: "12/03/2026" }, "date")).toBeNull();
    expect(readDay({ date: "0007-03-12" }, "date")).toBeNull();
    expect(readDay({}, "date")).toBeNull();
  });

  it("reads a list of objects, capped, with the junk dropped", () => {
    const cards = readObjects({ cards: [{ front: "a" }, null, "b", [1], { front: "c" }] }, "cards", 2);
    expect(cards).toEqual([{ front: "a" }, { front: "c" }]);
  });
});

describe("the school tutor's tools", () => {
  const { tools } = schoolAITools("user-1");
  const definitions = toolDefinitions(tools);

  it("are the six the prompt tells it about", () => {
    expect(definitions.map((d) => d.name).sort()).toEqual([
      "add_exam",
      "add_homework",
      "log_confusion",
      "make_flashcards",
      "make_podcast",
      "rate_topic",
    ]);
  });

  it("every one of them describes itself and every argument", () => {
    for (const definition of definitions) {
      expect(definition.description.length, definition.name).toBeGreaterThan(40);
      for (const [key, property] of Object.entries(definition.input_schema.properties)) {
        expect((property as { description?: string }).description, `${definition.name}.${key}`).toBeTruthy();
      }
    }
  });

  it("uses no schema keyword strict mode would refuse", () => {
    // minimum/maximum/minLength are documented as unsupported, and one of
    // them anywhere in the set takes every AI answer in the app down with a
    // 400 about a schema.
    const forbidden = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minLength", "maxLength", "multipleOf", "pattern"];
    const json = JSON.stringify(definitions);
    for (const keyword of forbidden) expect(json, keyword).not.toContain(`"${keyword}"`);
  });

  it("marks every nested object closed too", () => {
    // A nested schema without additionalProperties: false is refused the
    // same way the top-level one would be. make_flashcards has one.
    const cards = definitions.find((d) => d.name === "make_flashcards")!;
    const items = (cards.input_schema.properties.cards as { items: Record<string, unknown> }).items;
    expect(items.additionalProperties).toBe(false);
    expect(items.required).toEqual(["front", "back"]);
  });

  it("bounds the loop they run in", () => {
    expect(MAX_TOOL_ROUNDS).toBeGreaterThan(1);
    expect(MAX_TOOL_ROUNDS).toBeLessThan(12);
  });
});
