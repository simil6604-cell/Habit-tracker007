import { beforeEach, describe, expect, it, vi } from "vitest";

/** Fresh module each time — the health state is per running server. */
async function load() {
  vi.resetModules();
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key");
  return import("@/lib/ai/health");
}

beforeEach(() => vi.unstubAllEnvs());

describe("getAIHealth", () => {
  it("is quiet when nothing has gone wrong", async () => {
    const { getAIHealth } = await load();
    expect(getAIHealth().ok).toBe(true);
  });

  // The banner is on every page. One 429 is not an outage, and claiming one
  // teaches you to ignore the banner when it finally means something.
  it("does not raise the alarm on a single failed call", async () => {
    const { getAIHealth, recordAIFailure } = await load();
    recordAIFailure("the AI service is rate-limited right now");
    expect(getAIHealth().ok).toBe(true);
  });

  it("raises it on a second failure with no success between", async () => {
    const { getAIHealth, recordAIFailure } = await load();
    recordAIFailure("the API key was rejected as invalid");
    recordAIFailure("the API key was rejected as invalid");
    const health = getAIHealth();
    expect(health.ok).toBe(false);
    expect(health.problem).toContain("rejected as invalid");
  });

  it("raises it for a lone failure that is still the last thing that happened", async () => {
    const { getAIHealth, recordAIFailure } = await load();
    vi.useFakeTimers();
    try {
      recordAIFailure("the AI service is temporarily unavailable");
      expect(getAIHealth().ok).toBe(true);
      vi.advanceTimersByTime(6 * 60 * 1000);
      expect(getAIHealth().ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears once a call succeeds again", async () => {
    const { getAIHealth, recordAIFailure, recordAISuccess } = await load();
    recordAIFailure("boom");
    recordAIFailure("boom");
    expect(getAIHealth().ok).toBe(false);
    recordAISuccess();
    expect(getAIHealth().ok).toBe(true);
  });

  describe("problems knowable without making a call", () => {
    it("reports a missing key immediately, with the variable named", async () => {
      vi.resetModules();
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      const { getAIHealth } = await import("@/lib/ai/health");
      const health = getAIHealth();
      expect(health.ok).toBe(false);
      expect(health.problem).toContain("No AI key reached the app");
      expect(health.fix).toContain("ANTHROPIC_API_KEY");
    });

    it("spots a key pasted with whitespace, which fails as a 401 pointing elsewhere", async () => {
      vi.resetModules();
      vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test-key\n");
      const { getAIHealth } = await import("@/lib/ai/health");
      expect(getAIHealth().problem).toContain("space or line break");
    });
  });
});
