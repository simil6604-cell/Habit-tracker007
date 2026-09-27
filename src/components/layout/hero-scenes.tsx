/**
 * The artwork behind the domain hero banners.
 *
 * The first version was a flat gradient with a few 2.5px outlines on it — an
 * orange rectangle and a green rectangle, which is exactly the complaint.
 *
 * The rebuild went wrong once before it went right, and the reason is worth
 * keeping written down. The scenes were one SVG stretched across the whole
 * banner with `preserveAspectRatio="slice"` and a fixed 400x160 viewBox. A
 * hero is about 2.5:1 on a phone and over 5:1 on a laptop, and `slice` scales
 * to COVER: on a wide screen it blew the drawing up to more than double size
 * and cropped away the top and bottom, so a loaded barbell arrived on screen
 * as four enormous pale vertical bars. It looked like a rendering fault.
 *
 * So the banner is two independent layers now:
 *
 *  - the lighting and texture, done in CSS by `DomainHero`, which spans the
 *    full panel at any width because a CSS gradient has no aspect ratio to
 *    preserve;
 *  - the subject, an SVG anchored to the right edge at its own height and
 *    natural proportions, so it is never stretched, never cropped, and never
 *    crosses the title column.
 *
 * Solid shapes do the work and outlines only accent, because a thin stroke
 * disappears at this size while a filled plate survives.
 */

/** The bar chart under the gym barbell: this is a progress app, not a poster. */
function ProgressBars() {
  const heights = [20, 30, 44, 34, 56];
  return (
    <g fill="currentColor" opacity="0.16">
      {heights.map((h, i) => (
        <rect key={i} x={12 + i * 19} y={152 - h} width="13" height={h} rx="3" />
      ))}
    </g>
  );
}

export function GymScene() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-white"
      viewBox="0 0 320 160"
      preserveAspectRatio="xMaxYMid meet"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="hero-gym-steel" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.55" />
          <stop offset="100%" stopColor="white" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id="hero-gym-plate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.44" />
          <stop offset="100%" stopColor="white" stopOpacity="0.16" />
        </linearGradient>
      </defs>

      <ProgressBars />

      {/* A loaded bar, centred in this panel and reaching off the right edge. */}
      <g transform="translate(196 72)">
        <rect x="-116" y="-4.5" width="232" height="9" rx="4.5" fill="url(#hero-gym-steel)" />

        {/* knurling — the detail that makes it a barbell rather than a pipe */}
        <g stroke="white" strokeOpacity="0.3" strokeWidth="1.5">
          {[-46, -40, -34, 34, 40, 46].map((x) => (
            <line key={x} x1={x} y1="-6" x2={x} y2="6" />
          ))}
        </g>

        <rect x="-68" y="-10" width="9" height="20" rx="2.5" fill="white" fillOpacity="0.5" />
        <rect x="59" y="-10" width="9" height="20" rx="2.5" fill="white" fillOpacity="0.5" />

        <rect x="-86" y="-32" width="17" height="64" rx="5" fill="url(#hero-gym-plate)" />
        <rect x="69" y="-32" width="17" height="64" rx="5" fill="url(#hero-gym-plate)" />

        <rect x="-108" y="-44" width="19" height="88" rx="6" fill="url(#hero-gym-plate)" />
        <rect x="89" y="-44" width="19" height="88" rx="6" fill="url(#hero-gym-plate)" />
        {/* a lit near edge on each outer plate, so they read as round steel */}
        <rect x="-108" y="-44" width="5" height="88" rx="2.5" fill="white" fillOpacity="0.3" />
        <rect x="89" y="-44" width="5" height="88" rx="2.5" fill="white" fillOpacity="0.3" />
      </g>
    </svg>
  );
}

export function FootballScene() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full text-white"
      viewBox="0 0 320 160"
      preserveAspectRatio="xMaxYMid meet"
      fill="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="hero-football-turf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.14" />
          <stop offset="100%" stopColor="white" stopOpacity="0.03" />
        </linearGradient>
      </defs>

      {/* mown stripes — what says "pitch" before a single marking does */}
      <g opacity="0.09">
        <rect x="24" y="0" width="34" height="160" fill="white" />
        <rect x="92" y="0" width="34" height="160" fill="white" />
        <rect x="160" y="0" width="34" height="160" fill="white" />
        <rect x="228" y="0" width="34" height="160" fill="white" />
        <rect x="296" y="0" width="34" height="160" fill="white" />
      </g>

      {/* halfway line and centre circle, entering from the left */}
      <line x1="60" y1="0" x2="60" y2="160" stroke="white" strokeOpacity="0.26" strokeWidth="2.5" />
      <circle cx="60" cy="80" r="38" stroke="white" strokeOpacity="0.26" strokeWidth="2.5" />
      <circle cx="60" cy="80" r="3" fill="white" fillOpacity="0.4" />

      {/* the penalty box, filled so it survives at small sizes, bled off the right */}
      <path d="M 320 16 L 238 16 L 238 144 L 320 144 Z" fill="url(#hero-football-turf)" />
      <path d="M 320 16 L 238 16 L 238 144 L 320 144" stroke="white" strokeOpacity="0.34" strokeWidth="2.5" />
      <path d="M 320 52 L 288 52 L 288 108 L 320 108" stroke="white" strokeOpacity="0.28" strokeWidth="2.5" />
      <circle cx="264" cy="80" r="3" fill="white" fillOpacity="0.45" />
      {/* the penalty arc, the part outside the box, as it really is */}
      <path d="M 238 54 A 28 28 0 0 0 238 106" stroke="white" strokeOpacity="0.28" strokeWidth="2.5" />

      {/*
        No ball, and that was the third attempt rather than the first idea.
        The hero pins its action buttons to the top right, and this banner is
        short — a bright white ball in the upper half landed directly behind a
        white pill, and moving it down only made it look like a sticker stuck
        under the button. The pitch geometry says "football" perfectly well on
        its own, and nothing here is bright enough to fight a control.

        What replaces it is a shot: a dashed arc curling into the goal mouth.
        It is motion rather than an object, it lives in the flat lower half,
        and at 30% white it cannot compete with anything on top of it.
      */}
      <path
        d="M 24 150 Q 150 150 236 92"
        stroke="white"
        strokeOpacity="0.3"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="7 9"
        fill="none"
      />
      <circle cx="24" cy="150" r="4.5" fill="white" fillOpacity="0.45" />
    </svg>
  );
}
