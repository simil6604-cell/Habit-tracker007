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

/** Per request, because this is charged by the character. */
export const MAX_SPEECH_CHARS = 1_200;

/**
 * A fast model rather than the most expressive one: this is a back-and-forth
 * conversation, and a reply that arrives a second late stops it being one.
 */
const DEFAULT_MODEL = "eleven_flash_v2_5";

/** ElevenLabs' own long-standing default voice ("Rachel"). */
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

export function humanVoiceKey(): string | null {
  return process.env.ELEVENLABS_API_KEY?.trim() || null;
}

export function humanVoiceId(): string {
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
  options: { fetch?: typeof fetch; signal?: AbortSignal } = {}
): Promise<Response> {
  const key = humanVoiceKey();
  if (!key) throw new HumanVoiceError("NOT_CONFIGURED", VOICE_FAILURE_MESSAGE.NOT_CONFIGURED);

  const doFetch = options.fetch ?? fetch;
  const url = `${humanVoiceBaseUrl()}/v1/text-to-speech/${encodeURIComponent(humanVoiceId())}/stream`;

  let response: Response;
  try {
    response = await doFetch(url, {
      method: "POST",
      signal: options.signal,
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text: speakableWithin(text),
        model_id: humanVoiceModel(),
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
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
