/**
 * A voice that sounds like a person, through ElevenLabs.
 *
 * The browser's own speech synthesiser is free, works offline and sounds like
 * a browser's speech synthesiser. This replaces it for the two places someone
 * is actually having a conversation — the coach and the tutor in voice mode —
 * and falls back to the browser whenever this is not configured, not
 * reachable, or refuses. Falling back matters: a voice assistant that goes
 * silent because a third party is down is worse than one that sounds robotic.
 *
 * The key never leaves the server. The browser asks this app for audio and
 * this app asks ElevenLabs, so nothing in the page can read the key or spend
 * it on anything else.
 */

import { expressionFor } from "@/lib/ai/expression";

/** Per request, because this is charged by the character. */
export const MAX_SPEECH_CHARS = 1_200;

/**
 * Expression first.
 *
 * This was the flash model, chosen for latency, and latency is a real thing
 * in a conversation. But the complaint was not that it was slow: it was that
 * it sounded flat, and the flash models are the flat ones — they are built
 * to be quick. The multilingual model puts the stress in the right places,
 * reads a German sentence as German and an English one as English, and
 * costs a fraction of a second more.
 *
 * ELEVENLABS_MODEL_ID takes it back to eleven_flash_v2_5 for anyone who
 * would rather have the speed.
 */
const DEFAULT_MODEL = "eleven_multilingual_v2";

/** ElevenLabs' own long-standing default voice ("Rachel"). */
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

/**
 * How much life the voice puts into it.
 *
 * Stability is badly named: high is not "better", it is flatter. At 0.5 the
 * delivery is even and a bit of a readout; lower lets the model move the
 * pitch and pace around the way a person does. Style pushes it further
 * towards performance. This is a tutor talking to one student, so it wants
 * expression, not a newsreader — but not so loose that it starts inventing
 * accents, which is what the bottom of the stability range does.
 *
 * Tunable because the right setting is a matter of taste and the person
 * listening is not here.
 */
const DEFAULT_STABILITY = 0.3;
const DEFAULT_STYLE = 0.55;
const DEFAULT_SIMILARITY = 0.8;

/** A number from the environment, ignored unless it is one, and in range. */
function tuned(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
}

/**
 * The dials, for one expression setting.
 *
 * The student's choice decides them; the environment still wins where it is
 * set, because someone tuning this by hand on their own deployment has a
 * reason and should not be overruled by a dropdown.
 */
export function voiceSettings(
  expression?: unknown,
  env: Record<string, string | undefined> = process.env
) {
  const chosen = expressionFor(expression);
  return {
    stability: tuned(env.ELEVENLABS_STABILITY, chosen.voice.stability ?? DEFAULT_STABILITY),
    similarity_boost: tuned(env.ELEVENLABS_SIMILARITY, DEFAULT_SIMILARITY),
    style: tuned(env.ELEVENLABS_STYLE, chosen.voice.style ?? DEFAULT_STYLE),
    use_speaker_boost: true,
  };
}

export function humanVoiceKey(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

/**
 * ElevenLabs' other long-standing default ("Adam"), for the second speaker.
 *
 * A podcast is two people. With one key and two voice ids it is actually
 * two people; with one id it is one person doing both halves, which is
 * worse than the browser's two voices.
 */
const DEFAULT_VOICE_B = "pNInz6obpgDQGcFmaJgB";

export function humanVoiceId(speaker: "A" | "B" = "A"): string {
  if (speaker === "B") {
    return process.env.ELEVENLABS_VOICE_ID_B?.trim() || DEFAULT_VOICE_B;
  }
  return process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE;
}

export function humanVoiceModel(): string {
  return process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL;
}

/**
 * The API's address, overridable.
 *
 * Mainly so the whole path can be driven against a stand-in during testing,
 * which is the only way to prove this works without spending someone's
 * credit — and it costs nothing to let a self-hosted proxy sit here too.
 */
export function humanVoiceBaseUrl(): string {
  return (process.env.ELEVENLABS_BASE_URL?.trim() || "https://api.elevenlabs.io").replace(/\/+$/, "");
}

export function isHumanVoiceConfigured(): boolean {
  return humanVoiceKey() !== null;
}

export type VoiceFailure = "NOT_CONFIGURED" | "BAD_KEY" | "OUT_OF_CREDIT" | "BAD_VOICE" | "UNREACHABLE" | "UNKNOWN";

export class HumanVoiceError extends Error {
  readonly kind: VoiceFailure;
  constructor(kind: VoiceFailure, message: string) {
    super(message);
    this.kind = kind;
    this.name = "HumanVoiceError";
  }
}

export const VOICE_FAILURE_MESSAGE: Record<VoiceFailure, string> = {
  NOT_CONFIGURED: "No ElevenLabs key is set, so the browser's own voice is used.",
  BAD_KEY: "ElevenLabs refused the key. Check ELEVENLABS_API_KEY where the app's environment variables are set.",
  OUT_OF_CREDIT: "This ElevenLabs account is out of characters for now, so the browser's own voice is used.",
  BAD_VOICE: "ElevenLabs does not know that voice id. Check ELEVENLABS_VOICE_ID.",
  UNREACHABLE: "ElevenLabs could not be reached, so the browser's own voice is used.",
  UNKNOWN: "ElevenLabs refused the request and did not say why in a way this app recognises.",
};

export function classifyVoiceError(status: number, body: string): HumanVoiceError {
  if (status === 401 || status === 403) return new HumanVoiceError("BAD_KEY", VOICE_FAILURE_MESSAGE.BAD_KEY);
  if (status === 429) return new HumanVoiceError("OUT_OF_CREDIT", VOICE_FAILURE_MESSAGE.OUT_OF_CREDIT);
  // ElevenLabs reports both a missing voice and an exhausted quota as 422,
  // with the reason in the body, so the body is what decides.
  if (/quota|credit|limit_exceeded/i.test(body)) {
    return new HumanVoiceError("OUT_OF_CREDIT", VOICE_FAILURE_MESSAGE.OUT_OF_CREDIT);
  }
  if (status === 404 || /voice.*not.*found|voice_not_found/i.test(body)) {
    return new HumanVoiceError("BAD_VOICE", VOICE_FAILURE_MESSAGE.BAD_VOICE);
  }
  return new HumanVoiceError("UNKNOWN", `${VOICE_FAILURE_MESSAGE.UNKNOWN} (HTTP ${status})`);
}

/**
 * Trims what is sent, for the reason every character costs money.
 *
 * Cut at a sentence end where there is one nearby, so a capped reply stops
 * somewhere a person would stop rather than mid-word.
 */
export function speakableWithin(text: string, limit: number = MAX_SPEECH_CHARS): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (lastStop > limit * 0.6 ? cut.slice(0, lastStop + 1) : cut).trim();
}

/**
 * Asks ElevenLabs to say something, and hands back the audio as it arrives.
 *
 * Streamed rather than buffered: the first sound should start playing while
 * the rest is still being generated, which is the difference between a
 * conversation and a wait.
 */
export async function synthesizeSpeech(
  text: string,
  options: {
    fetch?: typeof fetch;
    signal?: AbortSignal;
    speaker?: "A" | "B";
    /** The student's expression setting, which moves the dials below. */
    expression?: unknown;
  } = {}
): Promise<Response> {
  const key = humanVoiceKey();
  if (!key) throw new HumanVoiceError("NOT_CONFIGURED", VOICE_FAILURE_MESSAGE.NOT_CONFIGURED);

  const doFetch = options.fetch ?? fetch;
  const url = `${humanVoiceBaseUrl()}/v1/text-to-speech/${encodeURIComponent(
    humanVoiceId(options.speaker ?? "A")
  )}/stream`;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      signal: options.signal,
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: speakableWithin(text),
        model_id: humanVoiceModel(),
        voice_settings: voiceSettings(options.expression),
      }),
    });
  } catch {
    // Offline, DNS, a blocked egress — the caller falls back to the browser.
    throw new HumanVoiceError("UNREACHABLE", VOICE_FAILURE_MESSAGE.UNREACHABLE);
  }

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      // A refusal with an unreadable body is still a refusal.
    }
    throw classifyVoiceError(response.status, body);
  }
  return response;
}
