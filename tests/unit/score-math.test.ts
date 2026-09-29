import { describe, expect, it } from "vitest";
import { overallScore, type DomainPart } from "@/lib/planner/score-math";

const on = (score: number): DomainPart => ({ score, inUse: true });
const off: DomainPart = { score: 0, inUse: false };

describe("overallScore", () => {
  it("averages the domains in use, then weights recovery at 15%", () => {
    // (80 + 40) / 2 = 60 → 60 * 0.85 + 100 * 0.15 = 66
    expect(overallScore([on(80), on(40), off], 100)).toBe(66);
  });

  it("never falls because you did something", () => {
    // The bug this replaced: gym counted only above zero, so a week with a
    // planned but untouched gym was scored on school alone — and the first
    // workout logged then DROPPED the overall score.
    const before = overallScore([on(80), { score: 0, inUse: true }, off], 100)!;
    const after = overallScore([on(80), on(33), off], 100)!;
    expect(after).toBeGreaterThan(before);
  });

  it("counts a domain that scored zero, because zero is the point of it", () => {
    const hidden = overallScore([on(80), off, off], 100)!;
    const counted = overallScore([on(80), { score: 0, inUse: true }, off], 100)!;
    expect(counted).toBeLessThan(hidden);
  });

  it("says nothing rather than something, with nothing set up", () => {
    // Recovery alone used to print 15% on a brand-new account: a score for a
    // week nobody has described to the app.
    expect(overallScore([off, off, off], 100)).toBeNull();
    expect(overallScore([], 100)).toBeNull();
  });

  it("scores a single domain on its own merits", () => {
    // 90 * 0.85 + 60 * 0.15 = 85.5 → 86
    expect(overallScore([on(90), off, off], 60)).toBe(86);
  });

  it("stays inside 0–100 at both ends", () => {
    expect(overallScore([on(0), on(0), on(0)], 0)).toBe(0);
    expect(overallScore([on(100), on(100), on(100)], 100)).toBe(100);
  });
});
