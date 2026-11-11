/**
 * How much the microphone is actually picking up.
 *
 * Asked for as "the microphone has to be stronger so it hears every detail".
 * A browser gives no way to turn a microphone up: the gain is the operating
 * system's, and speech recognition opens its own stream with its own
 * settings that cannot be reached from here. What it does give is a way to
 * SEE what is arriving — and seeing is most of the fix, because the three
 * things that actually cost a lesson are all visible in the level and
 * invisible otherwise: a phone face down on the desk, a phone in a bag, and
 * a teacher too far away.
 *
 * So this measures the input and says when nothing is coming through. The
 * pure half lives here so it can be tested without a microphone.
 */

/**
 * What to ask the browser for when listening to a ROOM.
 *
 * The defaults are tuned for a phone call: echo cancellation and noise
 * suppression both assume one voice close to the microphone and treat
 * everything else as noise to be removed — which, in a classroom, is the
 * teacher at the front. Automatic gain is the opposite: it lifts a quiet
 * distant voice, which is exactly what is wanted here.
 */
export const ROOM_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: true,
};

/**
 * One reading from the analyser, as 0 to 1.
 *
 * Root mean square rather than peak: a single click should not read as a
 * room full of speech, and RMS is what tracks how loud something sounds.
 * The bytes arrive centred on 128, so each is turned into -1..1 first.
 */
export function levelFromSamples(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = (samples[i] - 128) / 128;
    sum += value * value;
  }
  const rms = Math.sqrt(sum / samples.length);
  // Speech in a room sits well under half scale, so the bar is scaled to
  // make the useful range visible rather than a sliver at the bottom.
  return Math.min(1, rms * 4);
}

/** Below this, nothing useful is being recorded — it is room tone. */
export const SILENT_LEVEL = 0.04;

/** How long of that before it is worth interrupting someone in a lesson. */
export const SILENCE_WARNING_MS = 25_000;

export type MicStatus = "silent" | "quiet" | "good";

/**
 * What the current level means, in three steps rather than a number.
 *
 * Three because that is all anyone can act on: nothing is arriving, it is
 * arriving but faintly, or it is fine.
 */
export function micStatus(level: number): MicStatus {
  if (level < SILENT_LEVEL) return "silent";
  if (level < 0.14) return "quiet";
  return "good";
}

/**
 * Whether to say something about it.
 *
 * Only after a long stretch of silence, and only while recording: a lesson
 * has real pauses in it, and a warning that appears every time the teacher
 * stops to write on the board is a warning nobody reads.
 */
export function shouldWarnSilent(silentForMs: number): boolean {
  return silentForMs >= SILENCE_WARNING_MS;
}

export const SILENT_ADVICE =
  "Nothing is reaching the microphone. Take the phone out of your pocket or bag, lay it screen-up on the desk with nothing over it, and put it as near the front as you can.";

export const QUIET_ADVICE =
  "Only picking up a little. Move the phone closer to whoever is talking, or away from a noisy fan or window.";

/** A live meter, or null on a browser that will not give one. */
export type MicMeter = { stop: () => void };

/**
 * Opens a second, listen-only stream purely to measure the level.
 *
 * Separate from the recogniser's own stream on purpose: the Web Speech API
 * opens and owns one that nothing here can reach or configure. Two readers
 * of the same microphone is something browsers allow, and if this one is
 * refused the recording carries on without a meter — it must never be the
 * reason a lesson is not recorded.
 */
export async function startMicMeter(onLevel: (level: number) => void): Promise<MicMeter | null> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: ROOM_AUDIO_CONSTRAINTS });
  } catch {
    return null;
  }

  type AudioCtor = typeof AudioContext;
  const Ctor: AudioCtor | undefined =
    typeof window !== "undefined"
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext
      : undefined;
  if (!Ctor) {
    for (const track of stream.getTracks()) track.stop();
    return null;
  }

  const context = new Ctor();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const samples = new Uint8Array(analyser.fftSize);
  let running = true;

  const tick = () => {
    if (!running) return;
    // The byte-domain view: what the waveform looks like right now.
    analyser.getByteTimeDomainData(samples);
    onLevel(levelFromSamples(samples));
    setTimeout(tick, 150);
  };
  tick();

  return {
    stop: () => {
      running = false;
      try {
        source.disconnect();
        void context.close();
      } catch {
        // Already closed — nothing to do.
      }
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
