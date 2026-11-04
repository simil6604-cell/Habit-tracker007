import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

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
      res.end(
        JSON.stringify({
          id: "msg_stub",
          type: "message",
          role: "assistant",
          model: "stub",
          content: [{ type: "text", text: "Der Zellkern steuert die Zelle." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 8 },
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function ask(env: Record<string, string>, context: Record<string, unknown> = {}) {
  captured = [];
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
    return { text, request: captured[0] };
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
    expect(request.body.system).toBe("You are a tutor.");
    const content = (request.body.messages as { content: unknown[] }[])[0].content;
    expect(content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/png", data: "QUJD" } },
      { type: "text", text: "Was macht der Zellkern?" },
    ]);
  });

  it("does not send a thinking budget, which this model refuses", async () => {
    // Thinking is always on here and cannot be configured; a budget comes
    // back as a 400 on every request the app makes.
    const { request } = await ask({ ANTHROPIC_API_KEY: FAKE_KEY });
    expect(request.body.thinking).toBeUndefined();
    expect(request.body.temperature).toBeUndefined();
  });
});
