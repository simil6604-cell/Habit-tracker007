"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { utteranceForSpeaker, speechSupported } from "@/lib/ai/voice/speak";
import { splitIntoSpokenPieces } from "@/lib/school/podcast";

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
 */
export function PodcastPlayer({
  script,
  title,
  subtitle,
  autoPlay = false,
  onFinished,
}: {
  script: string;
  title: string;
  /** What to show under the title on a lock screen. */
  subtitle?: string;
  /** Starts by itself when the episode before it in the queue has finished. */
  autoPlay?: boolean;
  /** So a list can move on to the next episode without anyone touching the phone. */
  onFinished?: () => void;
}) {
  const pieces = splitIntoSpokenPieces(script);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [note, setNote] = useState<string | null>(null);

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
   * Started by the queue rather than by a press.
   *
   * Mobile browsers only allow sound that a tap asked for — but the tap
   * that started the first episode counts for the ones that follow in the
   * same page, which is what makes a playlist possible at all.
   */
  useEffect(() => {
    if (!autoPlay) return;
    playFrom(0);
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
        // The point of a queue: at the gym nobody is going to pick up the
        // phone between episodes.
        finishedRef.current?.();
        return;
      }
      setAt(index);

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
  };

  const pct = pieces.length === 0 ? 0 : Math.round((at / pieces.length) * 100);

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
          onClick={stop}
          disabled={!playing && at === 0}
          aria-label={`Stop ${title}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-foreground disabled:opacity-40"
        >
          <Square size={13} />
        </button>
        <span className="min-w-0 flex-1">
          <span className="block h-1.5 overflow-hidden rounded-full bg-surface-muted">
            <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted" data-testid="podcast-progress">
          {at + (playing ? 1 : 0)}/{pieces.length}
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
