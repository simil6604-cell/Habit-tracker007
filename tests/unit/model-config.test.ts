import { describe, it, expect } from "vitest";
import {
  anthropicEffort,
  anthropicModel,
  DEFAULT_EFFORT,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL,
} from "@/lib/ai/model-config";

describe("which model the app asks for", () => {
  it("is a current one by default", () => {
    // Written out rather than compared to itself: the point of the test is
    // that changing the default is a deliberate act with a diff, not
    // something that happens while editing something else nearby.
    expect(DEFAULT_MODEL).toBe("claude-opus-5-5");
    expect(anthropicModel({})).toBe("claude-opus-5-5");
  });

  it("takes whatever the environment says instead", () => {
    // Whose credit this spends is not this file's decision. Sonnet is the
    // cheaper current model and has to be reachable without a code change.
    expect(anthropicModel({ ANTHROPIC_MODEL: "claude-sonnet-5-5" })).toBe(
      "claude-sonnet-5-5"
    );
  });

  it("ignores an empty or blank setting rather than sending it", () => {
    // An env var set to nothing is how a dashboard records "I cleared this",
    // and sending "" as a model name is a 400 on every request in the app.
    expect(anthropicModel({ ANTHROPIC_MODEL: "" })).toBe(DEFAULT_MODEL);
    expect(anthropicModel({ ANTHROPIC_MODEL: "   " })).toBe(DEFAULT_MODEL);
  });

  it("trims a value pasted with a newline on the end", () => {
    expect(anthropicModel({ ANTHROPIC_MODEL: " claude-sonnet-5-5\n" })).toBe(
      "claude-sonnet-5-5"
    );
  });
});

describe("how hard it is asked to think", () => {
  it("is stated rather than left to the model's own default", () => {
    expect(anthropicEffort({})).toBe(DEFAULT_EFFORT);
  });

  it("takes any of the five levels", () => {
    for (const level of ["low", "medium", "high", "xhigh", "max"]) {
      expect(anthropicEffort({ ANTHROPIC_EFFORT: level })).toBe(level);
    }
    expect(anthropicEffort({ ANTHROPIC_EFFORT: "HIGH" })).toBe("high");
  });

  it("falls back on a typo instead of sending it", () => {
    // The API refuses an unknown level with a 400. Sent as typed, one
    // mistyped environment variable takes every AI feature in the app down
    // at once, with an error that names none of this.
    expect(anthropicEffort({ ANTHROPIC_EFFORT: "higgh" })).toBe(DEFAULT_EFFORT);
    expect(anthropicEffort({ ANTHROPIC_EFFORT: "maximum" })).toBe(DEFAULT_EFFORT);
    expect(anthropicEffort({ ANTHROPIC_EFFORT: "" })).toBe(DEFAULT_EFFORT);
  });
});

describe("how long a reply may be", () => {
  it("leaves room for the callers that ask for a list of things", () => {
    // Only what is produced is billed, so a generous ceiling costs nothing
    // on a short answer. The old 1024 was about 700 words — enough for a
    // chat reply, not enough for ten quiz questions as JSON, which is what
    // several callers that pass no limit of their own are asking for.
    expect(DEFAULT_MAX_TOKENS).toBeGreaterThanOrEqual(4000);
  });
});
