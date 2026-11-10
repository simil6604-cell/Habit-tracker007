import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { MAX_TOOL_ROUNDS } from "@/lib/ai/tool-use";

/**
 * What this app actually sends to Claude.
 *
 * Everything else about the AI is tested against a fake provider, which
 * proves the app's own logic and proves nothing about the request on the
 * wire. This stands a stand-in Claude API up on a port, points the SDK at
 * it, and reads what arrives — the whole chain, with no key and nobody's
 * credit spent.
 *
 * Worth having because the two things most likely to be wrong here are
 * invisible from inside the app: a model name that no longer exists, and a
 * parameter the model refuses. Both come back as one HTTP error that says
 * nothing about which of them it was.
 */

type Captured = { path: string; headers: Record<string, string>; body: Record<string, unknown> };

/**
 * Long enough to get past the app's own key check, which refuses a short
 * one on the grounds that it is the console's display label rather than a
 * key. That check is doing its job here — the first draft of this test used
 * a short string and was turned away by it.
 */
const FAKE_KEY = `sk-ant-api03-${"A".repeat(95)}`;

let server: Server;
let captured: Captured[] = [];
let baseUrl = "";
/**
 * What the stand-in Claude says next.
 *
 * A queue rather than one fixed reply, because the thing being tested is now
 * a conversation: ask for a tool, read the result, then answer. One reply
 * could never show the second request at all.
 */
let replies: Record<string, unknown>[] = [];

function textReply(text: string): Record<string, unknown> {
  return {
    id: "msg_stub",
    type: "message",
    role: "assistant",
    model: "stub",
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 8 },
  };
}

/** A reply that asks for a tool, the way a real one arrives: thinking, then the call. */
function toolReply(name: string, input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "msg_stub_tool",
    type: "message",
    role: "assistant",
    model: "stub",
    content: [
      { type: "thinking", thinking: "They told me about an exam.", signature: "sig-abc" },
      { type: "tool_use", id: "toolu_1", name, input },
    ],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 8 },
  };
}

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      captured.push({
        path: req.url ?? "",
        headers: req.headers as Record<string, string>,
        body: raw ? JSON.parse(raw) : {},
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(replies.shift() ?? textReply("Der Zellkern steuert die Zelle.")));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function ask(
  env: Record<string, string>,
  context: Record<string, unknown> = {},
  queue: Record<string, unknown>[] = []
) {
  captured = [];
  replies = queue;
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries({ ANTHROPIC_BASE_URL: baseUrl, ...env })) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    // Imported inside, after the environment is set: the provider reads it
    // in its constructor.
    const { AnthropicProvider } = await import("@/lib/ai/anthropic-provider");
    const text = await new AnthropicProvider().generate("Was macht der Zellkern?", context);
    return { text, request: captured[0], requests: captured };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("the request this app sends", () => {
  it("reaches the Messages API with the key, the question and an answer back", async () => {
    const { text, request } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY });

    expect(request.path).toBe("/v1/messages");
    expect(request.headers["x-api-key"]).toBe(FAKE_KEY);
    expect(request.body.messages).toEqual([{ role: "user", content: "Was macht der Zellkern?" }]);
    // And the reply comes back out the other side, which is the whole point.
    expect(text).toBe("Der Zellkern steuert die Zelle.");
  });

  it("names a current model, and the one the environment asks for", async () => {
    const plain = await ask({ ANTHROPIC_API_KEY: FAKE_KEY });
    expect(plain.request.body.model).toBe("claude-opus-5-5");

    const chosen = await ask({
      ANTHROPIC_API_KEY: FAKE_KEY,
      ANTHROPIC_MODEL: "claude-sonnet-5-5",
    });
    expect(chosen.request.body.model).toBe("claude-sonnet-5-5");
  });

  it("states the effort rather than leaving it to a default that can move", async () => {
    const plain = await ask({ ANTHROPIC_API_KEY: FAKE_KEY });
    expect(plain.request.body.output_config).toEqual({ effort: "medium" });

    const harder = await ask({
      ANTHROPIC_API_KEY: FAKE_KEY,
      ANTHROPIC_EFFORT: "high",
    });
    expect(harder.request.body.output_config).toEqual({ effort: "high" });
  });

  it("leaves a reply room to finish", async () => {
    const { request } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY });
    expect(Number(request.body.max_tokens)).toBeGreaterThanOrEqual(4000);

    const capped = await ask({ ANTHROPIC_API_KEY: FAKE_KEY }, { maxTokens: 16 });
    expect(capped.request.body.max_tokens).toBe(16);
  });

  it("sends a photo of a worksheet as an image block beside the question", async () => {
    const { request } = await ask(
      { ANTHROPIC_API_KEY: FAKE_KEY },
      { imageBase64: "QUJD", imageMediaType: "image/png", system: "You are a tutor." }
    );
    // The system prompt goes as a cacheable block rather than a bare string
    // — see the caching assertions below.
    expect(request.body.system).toEqual([
      { type: "text", text: "You are a tutor.", cache_control: { type: "ephemeral" } },
    ]);
    const content = (request.body.messages as { content: unknown[] }[])[0].content;
    expect(content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
      { type: "text", text: "Was macht der Zellkern?" },
    ]);
  });

  it("sends a conversation as turns, not as a transcript in one message", async () => {
    // The school AI used to flatten its history into one user message with
    // "Student:" and "Tutor:" in front of each line. Told which words were
    // its own, Claude follows a thread far better than it does reading a
    // transcript of itself.
    const { request } = await ask(
      { ANTHROPIC_API_KEY: FAKE_KEY },
      {
        turns: [
          { role: "user", content: "Was ist Osmose?" },
          { role: "assistant", content: "Wasser wandert zur höheren Konzentration." },
        ],
      }
    );
    expect(request.body.messages).toEqual([
      { role: "user", content: "Was ist Osmose?" },
      { role: "assistant", content: "Wasser wandert zur höheren Konzentration." },
      { role: "user", content: "Was macht der Zellkern?" },
    ]);
  });

  it("refuses to open a conversation with the assistant, which the API rejects", async () => {
    // A trimmed history can easily begin with the tutor's turn, and a
    // conversation that does not start with the person is a 400 on every
    // message from then on.
    const { request } = await ask(
      { ANTHROPIC_API_KEY: FAKE_KEY },
      { turns: [{ role: "assistant", content: "Where were we?" }, { role: "user", content: "Osmose." }] }
    );
    const messages = request.body.messages as { role: string }[];
    expect(messages[0].role).toBe("user");
    expect(messages).toHaveLength(2);
  });

  it("drops anything in the history that is not a turn, rather than sending it", async () => {
    const { request } = await ask(
      { ANTHROPIC_API_KEY: FAKE_KEY },
      { turns: [{ role: "system", content: "x" }, { role: "user", content: "   " }, null, "nope"] }
    );
    expect(request.body.messages).toHaveLength(1);
  });

  it("marks the system prompt cacheable, and nothing else", async () => {
    // It is the long, unchanging half of every request — which syllabus,
    // which subjects, what is due — repeated on every message. A breakpoint
    // after the question, which changes every time, would cache nothing.
    const { request } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY }, { system: "Long standing context." });
    expect(request.body.system).toEqual([
      { type: "text", text: "Long standing context.", cache_control: { type: "ephemeral" } },
    ]);
    expect(JSON.stringify(request.body.messages)).not.toContain("cache_control");
  });

  it("sends no system block at all when there is no system prompt", async () => {
    const { request } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY });
    expect(request.body.system).toBeUndefined();
  });

  it("does not send a thinking budget, which this model refuses", async () => {
    // Thinking is always on here and cannot be configured; a budget comes
    // back as a 400 on every request the app makes.
    const { request } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY });
    expect(request.body.thinking).toBeUndefined();
    expect(request.body.temperature).toBeUndefined();
  });
});

describe("letting Claude do things, not just say them", () => {
  const adder = {
    name: "add_exam",
    description: "Puts an exam in the student's app.",
    schema: {
      type: "object" as const,
      properties: { title: { type: "string", description: "What it is" } },
      required: ["title"],
      additionalProperties: false as const,
    },
    run: async (input: Record<string, unknown>) => ({ ok: true, message: `Added ${String(input.title)}.` }),
  };

  it("sends no tools at all when the call site handed none in", async () => {
    const { request } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY });
    // Not an empty list: a request with `tools: []` is a different request
    // from one with no tools, and every feature in this app but the tutor
    // sends the second kind.
    expect(request.body.tools).toBeUndefined();
    expect(request.body.tool_choice).toBeUndefined();
  });

  it("describes each tool under strict mode, and never forces one", async () => {
    const { request } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY }, { tools: [adder] });
    expect(request.body.tools).toEqual([
      {
        name: "add_exam",
        description: "Puts an exam in the student's app.",
        input_schema: {
          type: "object",
          properties: { title: { type: "string", description: "What it is" } },
          required: ["title"],
          additionalProperties: false,
        },
        strict: true,
      },
    ]);
    // Forcing a tool is refused outright on this model, and "auto" is the
    // behaviour we want anyway — most questions are questions.
    expect(request.body.tool_choice).toBeUndefined();
  });

  it("runs the tool, hands the result back, and answers from it", async () => {
    const { text, requests } = await ask(
      { ANTHROPIC_API_KEY: FAKE_KEY },
      { tools: [adder] },
      [toolReply("add_exam", { title: "Biology Paper 2" }), textReply("Done — it's in your app.")]
    );

    expect(requests).toHaveLength(2);
    const second = requests[1].body.messages as { role: string; content: unknown }[];
    // The question, the turn that asked for the tool, then the result.
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);

    // The assistant turn goes back exactly as it arrived — the thinking
    // block included, because it is only valid in the conversation that
    // produced it.
    expect(second[1].content).toEqual([
      { type: "thinking", thinking: "They told me about an exam.", signature: "sig-abc" },
      { type: "tool_use", id: "toolu_1", name: "add_exam", input: { title: "Biology Paper 2" } },
    ]);
    expect(second[2].content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_1", content: "Added Biology Paper 2." },
    ]);
    expect(text).toBe("Done — it's in your app.");
  });

  it("returns every result of a parallel call in one message", async () => {
    const twoCalls = {
      id: "msg_two",
      type: "message",
      role: "assistant",
      model: "stub",
      content: [
        { type: "tool_use", id: "toolu_a", name: "add_exam", input: { title: "Paper 1" } },
        { type: "tool_use", id: "toolu_b", name: "add_exam", input: { title: "Paper 2" } },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    const { requests } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY }, { tools: [adder] }, [twoCalls, textReply("Both in.")]);

    const messages = requests[1].body.messages as { role: string; content: unknown }[];
    // Split across two messages this is rejected outright.
    expect(messages).toHaveLength(3);
    expect(messages[2].content).toEqual([
      { type: "tool_result", tool_use_id: "toolu_a", content: "Added Paper 1." },
      { type: "tool_result", tool_use_id: "toolu_b", content: "Added Paper 2." },
    ]);
  });

  it("hands a failed tool back as a failed tool, not as a failed request", async () => {
    const refuser = {
      ...adder,
      run: async () => ({ ok: false, message: 'No subject called "Fysics".' }),
    };
    const { text, requests } = await ask(
      { ANTHROPIC_API_KEY: FAKE_KEY },
      { tools: [refuser] },
      [toolReply("add_exam", { title: "x" }), textReply("Which subject did you mean?")]
    );
    const results = (requests[1].body.messages as { content: { is_error?: boolean }[] }[])[2].content;
    expect(results[0]).toMatchObject({ is_error: true, content: 'No subject called "Fysics".' });
    // The conversation carries on, which is the whole point of handing the
    // failure to the model instead of turning it into an error page.
    expect(text).toBe("Which subject did you mean?");
  });

  it("says so rather than guessing when the model asks for a tool that isn't there", async () => {
    const { requests } = await ask(
      { ANTHROPIC_API_KEY: FAKE_KEY },
      { tools: [adder] },
      [toolReply("delete_everything", {}), textReply("Sorry.")]
    );
    const results = (requests[1].body.messages as { content: { is_error?: boolean; content?: string }[] }[])[2].content;
    expect(results[0].is_error).toBe(true);
    expect(results[0].content).toContain("no tool called delete_everything");
  });

  it("stops asking for tools after a bounded number of rounds", async () => {
    // A tool that always leads to another call would otherwise bill a
    // request a second until something fell over. A model that ignores the
    // last round's "answer in words now" gets a plain error instead, which
    // the chat shows as a failed answer — not an endless loop.
    const loop = Array.from({ length: 20 }, () => toolReply("add_exam", { title: "again" }));
    await expect(ask({ ANTHROPIC_API_KEY: FAKE_KEY }, { tools: [adder] }, loop)).rejects.toThrow(
      /never got to an answer/
    );
    expect(captured.length).toBeLessThanOrEqual(MAX_TOOL_ROUNDS + 2);

    // And the final round did tell it to stop asking.
    const last = captured[captured.length - 1].body.messages as { content: unknown }[];
    expect(JSON.stringify(last[last.length - 1].content)).toContain("Answer in words now");
  });

  it("gets to an answer when the last round is heeded", async () => {
    const loop = Array.from({ length: MAX_TOOL_ROUNDS }, () => toolReply("add_exam", { title: "again" }));
    const { text } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY }, { tools: [adder] }, [
      ...loop,
      textReply("That's all of them in."),
    ]);
    expect(text).toBe("That's all of them in.");
  });
});

describe("a PDF sent with the question", () => {
  it("goes as a document block, before the text", async () => {
    const { request } = await ask(
      { ANTHROPIC_API_KEY: FAKE_KEY },
      { documents: [{ base64: "JVBERi0=", title: "paper2.pdf" }] }
    );
    const content = (request.body.messages as { content: unknown[] }[])[0].content;
    expect(content).toEqual([
      {
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" },
        title: "paper2.pdf",
      },
      { type: "text", text: "Was macht der Zellkern?" },
    ]);
  });

  it("sits beside the photos when both arrive", async () => {
    const { request } = await ask(
      { ANTHROPIC_API_KEY: FAKE_KEY },
      { documents: [{ base64: "JVBERi0=" }], images: [{ base64: "QUJD", mediaType: "image/png" }] }
    );
    const content = (request.body.messages as { content: { type: string }[] }[])[0].content;
    // Documents, then images, then the question — attachments the answer
    // depends on are markedly less used when they follow the text.
    expect(content.map((block) => block.type)).toEqual(["document", "image", "text"]);
  });

  it("drops a malformed document rather than sending half a block", async () => {
    const { request } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY }, { documents: [{ title: "no data" }, null, "x"] });
    expect(request.body.messages).toEqual([{ role: "user", content: "Was macht der Zellkern?" }]);
  });
});
