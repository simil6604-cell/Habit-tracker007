"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, RotateCw, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { utteranceForSpeaker, speechSupported } from "@/lib/ai/voice/speak";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
import {
  formatClock,
  pieceAtSecond,
  pieceTimeline,
  resumeIndex,
  skipTo,
  splitIntoSpokenPieces,
  totalSpokenSeconds,
} from "@/lib/school/podcast";

/**
 * Plays an episode out loud, one piece at a time.
 *
 * A piece at a time rather than the whole script in one request: the first
 * sentence starts playing while the rest is still being made, which is the
 * difference between pressing play and waiting half a minute. It also means
 * pause and stop land immediately instead of at the end of a ten-minute
 * file.
 *
 * The human voice first, the browser's own when that is not configured or
 * not reachable — the same order the voice tutor uses, and for the same
 * reason: an episode that goes silent because a third party is down is
 * worse than one that sounds synthetic.
 *
 * It behaves like a voice recording, which is the thing it was asked to
 * be. That is not cosmetic: speaking a piece at a time is an implementation
 * detail, and a player that shows "7/41" and can only start at the
 * beginning makes you live with that detail. So there is a clock, a bar you
 * can drag to the middle of the episode, thirty seconds back and forward
 * for the sentence you missed on a noisy bus, and it carries on where you
 * stopped rather than starting again. Underneath it is still pieces: the
 * bar is drawn from how long the words take to say, and the voice saying it
 * has stopped is still what moves it on.
 */

/** Thirty seconds, which is about the length of a thought gone past. */
const SKIP_SECONDS = 30;

/** Where the place you stopped is kept, per episode, on this device. */
const resumeStore = (id: string) => `momentum.podcast.at.${id}`;

export function PodcastPlayer({
  script,
  title,
  subtitle,
  episodeId,
  autoPlay = false,
  onFinished,
}: {
  script: string;
  title: string;
  /** What to show under the title on a lock screen. */
  subtitle?: string;
  /** Which episode this is, so where you stopped can be kept for it. */
  episodeId?: string;
  /** Starts by itself when the episode before it in the queue has finished. */
  autoPlay?: boolean;
  /** So a list can move on to the next episode without anyone touching the phone. */
  onFinished?: () => void;
}) {
  const pieces = useMemo(() => splitIntoSpokenPieces(script), [script]);
  const timeline = useMemo(() => pieceTimeline(pieces), [pieces]);
  const total = totalSpokenSeconds(timeline);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  // Whether the browser's own voice is what is speaking. It is the one that
  // a phone locking its screen silences, so that is when the screen is held
  // awake — an audio file keeps playing in a pocket by itself.
  const [browserVoiceInUse, setBrowserVoiceInUse] = useState(false);
  useWakeLock(playing && browserVoiceInUse);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const humanVoiceRef = useRef(true);
  const atRef = useRef(0);
  atRef.current = at;
  // Held in a ref so a re-render with a new callback cannot restart or
  // interrupt an episode that is already playing.
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  const release = () => {
    const element = audioRef.current;
    if (element) {
      element.onended = null;
      element.onerror = null;
      element.pause();
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  };

  /*
   * Where you stopped last time.
   *
   * Read after the first render rather than into the initial state: the
   * server renders this page too and has no idea what is in a browser's
   * storage, and a value that differs between the two is a hydration error
   * rather than a convenience.
   *
   * Stored per episode and per device. It is a convenience, so every way it
   * can fail — private mode, storage turned off, a value left over from a
   * longer episode — ends up at the beginning rather than in an error.
   */
  useEffect(() => {
    if (!episodeId) return;
    try {
      const stored = window.localStorage.getItem(resumeStore(episodeId));
      const index = resumeIndex(stored, pieces.length);
      if (index > 0) {
        atRef.current = index;
        setAt(index);
      }
    } catch {
      // No storage here. It simply starts at the beginning.
    }
  }, [episodeId, pieces.length]);

  /** Remembers the spot, or forgets it once the episode has been heard out. */
  const remember = (index: number | null) => {
    if (!episodeId) return;
    try {
      if (index === null || index <= 0) window.localStorage.removeItem(resumeStore(episodeId));
      else window.localStorage.setItem(resumeStore(episodeId), String(index));
    } catch {
      // Storage refused. Nothing about playing depends on this.
    }
  };

  /*
   * Started by the queue rather than by a press.
   *
   * Mobile browsers only allow sound that a tap asked for — but the tap
   * that started the first episode counts for the ones that follow in the
   * same page, which is what makes a playlist possible at all.
   */
  useEffect(() => {
    if (!autoPlay) return;
    playFrom(atRef.current);
    // Only when this becomes the playing episode; playFrom is recreated on
    // every render and would restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay]);

  // Leaving the page mid-episode must not leave the browser talking.
  useEffect(
    () => () => {
      generationRef.current++;
      release();
      if (speechSupported()) window.speechSynthesis.cancel();
    },
    []
  );

  /*
   * The lock screen.
   *
   * This is listened to with the phone in a pocket on the way to training.
   * Without this the audio is anonymous: no title, no pause button on the
   * lock screen, and the headphone button does nothing. With it, the
   * episode behaves like anything else you play.
   *
   * Only the audio path can be controlled this way — a browser's own
   * synthesiser is not media and never appears there — but that is the
   * path that keeps playing with the screen off, so it is the one that
   * matters here.
   */
  const announce = (state: "playing" | "paused") => {
    if (typeof navigator === "undefined") return;
    const media = (navigator as unknown as { mediaSession?: MediaSession }).mediaSession;
    if (!media) return;
    try {
      if (typeof MediaMetadata !== "undefined") {
        media.metadata = new MediaMetadata({
          title,
          artist: subtitle ?? "Momentum",
          album: "Your own revision podcast",
        });
      }
      media.playbackState = state;
      media.setActionHandler("play", () => playFrom(atRef.current));
      media.setActionHandler("pause", () => pause());
      media.setActionHandler("stop", () => stop());
      // The same thirty seconds as the buttons on the page, on the lock
      // screen and on a headphone remote — which is where they are wanted,
      // since the phone is in a pocket.
      media.setActionHandler("seekbackward", () => skip(-SKIP_SECONDS));
      media.setActionHandler("seekforward", () => skip(SKIP_SECONDS));
    } catch {
      // An older browser, or a handler it does not know. Nothing here is
      // required for the episode to play.
    }
  };

  const playFrom = (start: number) => {
    const generation = ++generationRef.current;
    const current = () => generationRef.current === generation;

    // Created inside the press: mobile browsers only allow sound that a tap
    // asked for, and an element first created later is refused.
    if (!audioRef.current && typeof window !== "undefined") {
      try {
        audioRef.current = new Audio();
      } catch {
        // No Audio here; the browser voice still works.
      }
    }

    setPlaying(true);
    setNote(null);
    announce("playing");

    const sayFrom = (index: number) => {
      if (!current()) return;
      if (index >= pieces.length) {
        setPlaying(false);
        setAt(0);
        // Heard out, so there is no longer a place to carry on from.
        remember(null);
        // The point of a queue: at the gym nobody is going to pick up the
        // phone between episodes.
        finishedRef.current?.();
        return;
      }
      setAt(index);
      atRef.current = index;
      // Written as it goes rather than only on pause: a tab closed on the
      // bus, a phone that runs out of battery, and a browser that discards
      // a backgrounded page all end an episode without anything being
      // pressed.
      remember(index);

      let moved = false;
      const next = () => {
        if (moved || !current()) return;
        moved = true;
        sayFrom(index + 1);
      };

      const browserVoice = () => {
        if (!current() || moved) return;
        if (!speechSupported()) {
          setPlaying(false);
          setNote("This browser cannot speak, so there is nothing to play. The script is below.");
          return;
        }
        // Two voices, told apart by who is speaking — and the language is
        // decided from the whole script, because one line of an English
        // episode can easily be four words that look German.
        const utterance = utteranceForSpeaker(pieces[index].speaker, pieces[index].text, script);
        utterance.onend = next;
        utterance.onerror = next;
        // This is the voice a locked phone silences, so from here on the
        // screen is held awake while it plays.
        setBrowserVoiceInUse(true);
        window.speechSynthesis.speak(utterance);
      };

      void (async () => {
        const element = audioRef.current;
        if (element && humanVoiceRef.current) {
          try {
            const response = await fetch("/api/voice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: pieces[index].text, speaker: pieces[index].speaker }),
            });
            if (response.status === 503) {
              humanVoiceRef.current = false;
              setNote("No human voice is set up, so this is the browser's own voice.");
            } else if (response.ok && (response.headers.get("Content-Type") ?? "").startsWith("audio/")) {
              const blob = await response.blob();
              if (!current() || moved) return;
              release();
              const url = URL.createObjectURL(blob);
              urlRef.current = url;
              element.onended = next;
              element.onerror = () => browserVoice();
              // A real audio file: it keeps playing in a pocket with the
              // screen off, so nothing has to be held awake for it.
              setBrowserVoiceInUse(false);
              element.src = url;
              await element.play();
              return;
            }
          } catch {
            // Fall through to the browser's voice.
          }
        }
        browserVoice();
      })();
    };

    sayFrom(start);
  };

  const pause = () => {
    generationRef.current++;
    release();
    if (speechSupported()) window.speechSynthesis.cancel();
    setPlaying(false);
    announce("paused");
  };

  const stop = () => {
    pause();
    setAt(0);
    atRef.current = 0;
    remember(null);
  };

  /**
   * Moves to a point in the episode.
   *
   * Playing, it starts speaking from there, because a bar you drag while
   * nothing happens is a bar that does not work. Paused, it only moves the
   * mark — dragging must not start sound nobody asked for.
   */
  const goTo = (index: number) => {
    const bounded = Math.max(0, Math.min(index, pieces.length - 1));
    atRef.current = bounded;
    setAt(bounded);
    remember(bounded);
    if (playing) playFrom(bounded);
  };

  /** Thirty seconds back or on, from wherever the voice has got to. */
  const skip = (seconds: number) => goTo(skipTo(timeline, atRef.current, seconds));

  const elapsed = timeline[at]?.start ?? 0;
  const pct = total === 0 ? 0 : Math.round((elapsed / total) * 100);

  return (
    <div className="flex flex-col gap-2" data-testid="podcast-player">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => (playing ? pause() : playFrom(atRef.current))}
          aria-label={playing ? `Pause ${title}` : `Play ${title}`}
          data-testid="podcast-play"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition",
            playing ? "bg-surface-muted hover:bg-border" : "bg-accent text-accent-foreground hover:opacity-90"
          )}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button
          type="button"
          onClick={() => skip(-SKIP_SECONDS)}
          disabled={at === 0}
          aria-label={`Back ${SKIP_SECONDS} seconds in ${title}`}
          data-testid="podcast-back"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-foreground disabled:opacity-40"
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          onClick={() => skip(SKIP_SECONDS)}
          disabled={at >= pieces.length - 1}
          aria-label={`Forward ${SKIP_SECONDS} seconds in ${title}`}
          data-testid="podcast-forward"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-foreground disabled:opacity-40"
        >
          <RotateCw size={15} />
        </button>
        <button
          type="button"
          onClick={stop}
          disabled={!playing && at === 0}
          aria-label={`Stop ${title}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-foreground disabled:opacity-40"
        >
          <Square size={13} />
        </button>
        {/* A real slider rather than a bar with a click handler: dragging,
            arrow keys and a screen reader all come with it, and on a phone
            the thumb is something you can actually catch. */}
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={elapsed}
          step={1}
          onChange={(event) => goTo(pieceAtSecond(timeline, Number(event.target.value)))}
          aria-label={`Position in ${title}`}
          aria-valuetext={`${formatClock(elapsed)} of ${formatClock(total)}`}
          data-testid="podcast-seek"
          className="h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-surface-muted accent-accent"
          style={{
            background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-surface-muted) ${pct}%)`,
          }}
        />
        {/* A clock, like any voice recording: how far in, and how long it
            is. "7/41" is this player's own plumbing showing through. */}
        <span className="shrink-0 text-xs tabular-nums text-muted" data-testid="podcast-progress">
          {formatClock(elapsed)} / {formatClock(total)}
        </span>
      </div>
      {note && <p className="text-xs text-muted">{note}</p>}
      {playing && pieces[at] && (
        // The line being said, so it can be followed on a page as well as
        // heard — and so a muted phone still shows that it is working.
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-sm" data-testid="podcast-line">
          <span className="mr-1.5 text-xs font-semibold text-accent">
            {pieces[at].speaker === "A" ? "—" : "·"}
          </span>
          {pieces[at].text}
        </p>
      )}
    </div>
  );
}
