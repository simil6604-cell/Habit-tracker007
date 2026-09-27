import { cn } from "@/lib/utils";
import { FootballScene, GymScene } from "./hero-scenes";

/**
 * Deeper and more angled than they were.
 *
 * The old ones ran light-to-mid over three close steps, which is why they read
 * as one flat colour — there was barely a value change to see. These start
 * bright where the icon sits and fall into a genuinely dark corner, so the
 * panel has somewhere to recede to and the artwork has something to sit
 * against.
 */
const GRADIENTS: Record<string, string> = {
  school: "from-indigo-400 via-violet-600 to-indigo-900",
  gym: "from-amber-400 via-orange-600 to-rose-900",
  football: "from-emerald-300 via-green-600 to-emerald-950",
};

const SCENES: Partial<Record<string, React.ComponentType>> = {
  gym: GymScene,
  football: FootballScene,
};

export function DomainHero({
  domain,
  emoji,
  title,
  subtitle,
  actions,
}: {
  domain: "school" | "gym" | "football";
  emoji: string;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
}) {
  const Scene = SCENES[domain];
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-xl ring-1 ring-white/10 sm:p-7",
        GRADIENTS[domain]
      )}
    >
      {/*
        Lighting and texture in CSS rather than inside the scene SVG. A hero is
        2.5:1 on a phone and over 5:1 on a laptop; anything with a fixed viewBox
        stretched across that either distorts or gets cropped. A CSS gradient has
        no aspect ratio to preserve, so it covers the panel correctly at every
        width — and the scene is then free to keep its own proportions.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_150%_at_85%_0%,rgba(255,255,255,0.34),rgba(255,255,255,0.06)_45%,transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(90%_130%_at_0%_100%,rgba(0,0,0,0.32),transparent_65%)]"
      />
      {/* A fine diagonal weave. At 3% it is not seen so much as missed when absent. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06] bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.9)_0px,rgba(255,255,255,0.9)_1px,transparent_1px,transparent_9px)]"
      />

      {/*
        Boxed to the right half, and dimmed on a phone.
        Full width, the barbell ran straight through the subtitle: a hero is
        tall and narrow there, the text wraps to two lines and fills the panel,
        so ANY right-hand artwork sits under words. Half the width keeps it out
        of the title column, and half the opacity keeps what still overlaps
        from competing with the sentence on top of it.
      */}
      {Scene && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 -z-10 w-[62%] opacity-50 sm:w-1/2 sm:opacity-100"
        >
          <Scene />
        </div>
      )}

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-4xl shadow-inner ring-1 ring-white/25 backdrop-blur-sm">
            {emoji}
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight drop-shadow-sm">{title}</h1>
            <p className="mt-1 text-white/85">{subtitle}</p>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
