import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyVoiceError,
  humanVoiceId,
  HumanVoiceError,
  isHumanVoiceConfigured,
  MAX_SPEECH_CHARS,
  speakableWithin,
  synthesizeSpeech,
} from "@/lib/ai/voice/human-voice";

const KEY = "sk-elevenlabs-test-key";

describe("human voice configuration", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("is off until a key is set, and the app still works without one", () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(isHumanVoiceConfigured()).toBe(false);
    process.env.ELEVENLABS_API_KEY = "   ";
    expect(isHumanVoiceConfigured()).toBe(false);
  });

  it("has a voice without being told one", () => {
    expect(humanVoiceId()).toMatch(/^\w{10,}$/);
    process.env.ELEVENLABS_VOICE_ID = "my-own-voice";
    expect(humanVoiceId()).toBe("my-own-voice");
  });
});

describe("speakableWithin", () => {
  it("leaves a normal spoken reply alone", () => {
    const reply = "Two moles of hydrogen for every one of oxygen. Want to try one?";
    expect(speakableWithin(reply)).toBe(reply);
  });

  it("cuts a runaway reply, because every character is charged", () => {
    const long = `${"Sentence one is here. ".repeat(200)}`;
    const cut = speakableWithin(long);
    expect(cut.length).toBeLessThanOrEqual(MAX_SPEECH_CHARS);
    // Stops where a person would stop, not mid-word.
    expect(cut.endsWith(".")).toBe(true);
  });

  it("still cuts when there is no sentence end to cut at", () => {
    const cut = speakableWithin("x".repeat(5000));
    expect(cut.length).toBe(MAX_SPEECH_CHARS);
  });
});

describe("classifyVoiceError", () => {
  it("knows a refused key from an empty account", () => {
    expect(classifyVoiceError(401, "").kind).toBe("BAD_KEY");
    expect(classifyVoiceError(429, "").kind).toBe("OUT_OF_CREDIT");
    // Both arrive as 422, so the body is what decides.
    expect(classifyVoiceError(422, '{"detail":{"status":"quota_exceeded"}}').kind).toBe("OUT_OF_CREDIT");
    expect(classifyVoiceError(422, '{"detail":{"status":"voice_not_found"}}').kind).toBe("BAD_VOICE");
  });

  it("says what it got rather than guessing", () => {
    const error = classifyVoiceError(500, "nope");
    expect(error.kind).toBe("UNKNOWN");
    expect(error.message).toContain("500");
  });
});

describe("synthesizeSpeech", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = KEY;
    process.env.ELEVENLABS_BASE_URL = "https://voice.example";
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("sends the key in the header and never in the URL", async () => {
    let seenUrl = "";
    let seenInit: RequestInit = {};
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seenUrl = url;
      seenInit = init;
      return { ok: true, status: 200, body: null, headers: new Headers({ "Content-Type": "audio/mpeg" }) } as unknown as Response;
    }) as unknown as typeof fetch;

    await synthesizeSpeech("Hello there", { fetch: fakeFetch });

    // A key in a URL ends up in logs and proxies; it belongs in a header.
    expect(seenUrl).not.toContain(KEY);
    expect(seenUrl).toBe("https://voice.example/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream");
    expect((seenInit.headers as Record<string, string>)["xi-api-key"]).toBe(KEY);
    expect(JSON.parse(seenInit.body as string).text).toBe("Hello there");
  });

  it("refuses to call out at all with no key, rather than failing at the far end", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    let called = false;
    const fakeFetch = (async () => {
      called = true;
      return {} as Response;
    }) as unknown as typeof fetch;
    await expect(synthesizeSpeech("Hello", { fetch: fakeFetch })).rejects.toMatchObject({ kind: "NOT_CONFIGURED" });
    expect(called).toBe(false);
  });

  it("turns a network failure into something the caller can fall back from", async () => {
    const fakeFetch = (async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    }) as unknown as typeof fetch;
    await expect(synthesizeSpeech("Hello", { fetch: fakeFetch })).rejects.toMatchObject({ kind: "UNREACHABLE" });
  });

  it("classifies a refusal from the service", async () => {
    const fakeFetch = (async () =>
      ({ ok: false, status: 401, text: async () => "unauthorized" }) as unknown as Response) as unknown as typeof fetch;
    const error = await synthesizeSpeech("Hello", { fetch: fakeFetch }).catch((e) => e);
    expect(error).toBeInstanceOf(HumanVoiceError);
    expect(error.kind).toBe("BAD_KEY");
    expect(error.message).toMatch(/ELEVENLABS_API_KEY/);
  });
});
