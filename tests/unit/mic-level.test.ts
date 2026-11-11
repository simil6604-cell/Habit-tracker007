import { describe, expect, it } from "vitest";
import {
  levelFromSamples,
  micStatus,
  ROOM_AUDIO_CONSTRAINTS,
  shouldWarnSilent,
  SILENCE_WARNING_MS,
  SILENT_LEVEL,
} from "@/lib/ai/voice/mic-level";

/**
 * Reading how much is arriving at the microphone.
 *
 * A browser offers no way to turn a microphone up, so the honest version of
 * "make it stronger" is to show what is coming in and say when nothing is.
 * The maths is what decides whether the warning is trustworthy, so it is
 * tested against waveforms rather than eyeballed on a bar.
 */

/** A sine wave at a given amplitude, in the byte-domain form an analyser gives. */
function wave(amplitude: number, samples = 1024): Uint8Array {
  const data = new Uint8Array(samples);
  for (let i = 0; i < samples; i++) {
    data[i] = Math.round(128 + Math.sin((i / samples) * Math.PI * 2 * 8) * 127 * amplitude);
  }
  return data;
}

/** Digital silence is not zeros: it is the midpoint, repeated. */
const SILENCE = new Uint8Array(1024).fill(128);

describe("the level", () => {
  it("reads silence as nothing", () => {
    expect(levelFromSamples(SILENCE)).toBe(0);
    expect(levelFromSamples(new Uint8Array(0))).toBe(0);
  });

  it("rises with how loud the room is", () => {
    const quiet = levelFromSamples(wave(0.02));
    const talking = levelFromSamples(wave(0.2));
    const loud = levelFromSamples(wave(0.8));
    expect(quiet).toBeLessThan(talking);
    expect(talking).toBeLessThan(loud);
  });

  it("never goes above the top of the bar", () => {
    expect(levelFromSamples(wave(1))).toBeLessThanOrEqual(1);
    expect(levelFromSamples(wave(1))).toBeGreaterThan(0.9);
  });

  it("does not read a room-tone hiss as speech", () => {
    // A phone in a bag still returns a trickle. It has to land under the
    // threshold or the warning never fires when it should.
    expect(levelFromSamples(wave(0.005))).toBeLessThan(SILENT_LEVEL);
  });
});

describe("what the level means", () => {
  it("has three answers, because that is all anyone can act on", () => {
    expect(micStatus(0)).toBe("silent");
    expect(micStatus(0.08)).toBe("quiet");
    expect(micStatus(0.5)).toBe("good");
  });

  it("only speaks up after a long silence, not after a pause", () => {
    // A lesson has real pauses in it; a warning on every one is a warning
    // nobody reads.
    expect(shouldWarnSilent(5_000)).toBe(false);
    expect(shouldWarnSilent(SILENCE_WARNING_MS - 1)).toBe(false);
    expect(shouldWarnSilent(SILENCE_WARNING_MS)).toBe(true);
    expect(SILENCE_WARNING_MS).toBeGreaterThan(15_000);
  });
});

describe("what the browser is asked for", () => {
  it("asks for a room, not for a phone call", () => {
    // The defaults assume one voice close to the microphone and treat the
    // rest as noise to remove — in a classroom, that is the teacher.
    expect(ROOM_AUDIO_CONSTRAINTS.echoCancellation).toBe(false);
    expect(ROOM_AUDIO_CONSTRAINTS.noiseSuppression).toBe(false);
    // Automatic gain is the opposite: it lifts a quiet distant voice.
    expect(ROOM_AUDIO_CONSTRAINTS.autoGainControl).toBe(true);
  });
});
