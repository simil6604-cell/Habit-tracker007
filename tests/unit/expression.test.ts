import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPRESSION,
  EXPRESSIONS,
  expressionFor,
  isExpressionId,
  speechDirection,
  writingDirection,
} from "@/lib/ai/expression";

/**
 * The dial for how much life the AI puts into it.
 *
 * Asked for as a setting rather than a decision, because the right amount
 * of energy depends on the day. One preset moves three things at once — the
 * words, the voice's own expression dials, and how the browser reads — and
 * the thing worth testing is that they move together and in the same
 * direction, because a preset where one of the three disagrees is what
 * makes an assistant sound fake.
 */

const byId = (id: string) => EXPRESSIONS.find((style) => style.id === id)!;

describe("the presets", () => {
  it("run from calm to full throttle", () => {
    expect(EXPRESSIONS.map((style) => style.id)).toEqual(["CALM", "WARM", "MOTIVATING", "HYPE"]);
  });

  it("gets more expressive in step, on every dial", () => {
    const order = ["CALM", "WARM", "MOTIVATING", "HYPE"].map(byId);
    for (let i = 1; i < order.length; i++) {
      const before = order[i - 1];
      const now = order[i];
      // Stability is backwards: lower is more alive, which is exactly the
      // kind of thing that gets set the wrong way round once.
      expect(now.voice.stability, `${now.id} stability`).toBeLessThan(before.voice.stability);
      expect(now.voice.style, `${now.id} style`).toBeGreaterThan(before.voice.style);
      expect(now.browser.rate, `${now.id} rate`).toBeGreaterThan(before.browser.rate);
      expect(now.browser.pitch, `${now.id} pitch`).toBeGreaterThanOrEqual(before.browser.pitch);
    }
  });

  it("stays inside what the voices can actually do", () => {
    for (const style of EXPRESSIONS) {
      // Below about 0.15 stability ElevenLabs starts inventing accents.
      expect(style.voice.stability, style.id).toBeGreaterThanOrEqual(0.15);
      expect(style.voice.stability, style.id).toBeLessThanOrEqual(1);
      expect(style.voice.style, style.id).toBeGreaterThanOrEqual(0);
      expect(style.voice.style, style.id).toBeLessThanOrEqual(1);
      // Past about 1.2 the browser's voice is hard to follow, which defeats
      // the point for someone revising.
      expect(style.browser.rate, style.id).toBeGreaterThan(0.85);
      expect(style.browser.rate, style.id).toBeLessThanOrEqual(1.2);
      expect(style.browser.pitch, style.id).toBeLessThanOrEqual(1.2);
    }
  });

  it("says something real in both the spoken and the written direction", () => {
    for (const style of EXPRESSIONS) {
      expect(style.speech.length, style.id).toBeGreaterThan(80);
      expect(style.writing.length, style.id).toBeGreaterThan(30);
      expect(style.hint.length, style.id).toBeGreaterThan(20);
    }
  });

  it("never asks for flattery, at any setting", () => {
    // The loud ones are the risk: energy that is not about the specific
    // thing in front of them is noise, and a student hears it as noise.
    for (const style of [byId("MOTIVATING"), byId("HYPE")]) {
      expect(style.speech.toLowerCase(), style.id).toContain("never flattery");
    }
  });
});

describe("reading the stored value", () => {
  it("accepts the four it offers and nothing else", () => {
    expect(isExpressionId("HYPE")).toBe(true);
    expect(isExpressionId("LOUD")).toBe(false);
    expect(isExpressionId(null)).toBe(false);
    expect(isExpressionId(3)).toBe(false);
  });

  it("falls back rather than throwing on anything else", () => {
    // A row written before this existed, or a value from an older build.
    expect(expressionFor(undefined).id).toBe(DEFAULT_EXPRESSION);
    expect(expressionFor("NONSENSE").id).toBe(DEFAULT_EXPRESSION);
    expect(expressionFor("MOTIVATING").id).toBe("MOTIVATING");
  });

  it("is warm by default, which is the one most days want", () => {
    expect(DEFAULT_EXPRESSION).toBe("WARM");
  });
});

describe("what goes into the prompt", () => {
  it("says the student chose it, so it is not overridden as a stray instruction", () => {
    const direction = speechDirection("HYPE");
    expect(direction).toContain("set by the student");
    expect(direction).toContain(byId("HYPE").speech);
  });

  it("has a written form too, so the chat and the voice are one person", () => {
    expect(writingDirection("CALM")).toContain(byId("CALM").writing);
    expect(writingDirection("rubbish")).toContain(byId(DEFAULT_EXPRESSION).writing);
  });
});
