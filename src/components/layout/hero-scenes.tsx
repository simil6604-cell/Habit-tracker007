/**
 * Hand-drawn decorative scenes for the domain hero banners — real vector
 * illustrations (pitch markings, a barbell) rather than a flat gradient,
 * since we can't fetch external stock photos into this app. Kept to the
 * right two-thirds of the banner so they never cross the title text.
 */

export function FootballScene() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden
    >
      {/* floodlight glows */}
      <circle cx="380" cy="0" r="90" fill="white" opacity="0.06" />
      <circle cx="20" cy="160" r="70" fill="black" opacity="0.12" />

      {/* pitch markings, kept right of the text column */}
      <line x1="230" y1="0" x2="230" y2="160" stroke="white" strokeOpacity="0.2" strokeWidth="2.5" />
      <circle cx="300" cy="80" r="42" stroke="white" strokeOpacity="0.22" strokeWidth="2.5" />
      <circle cx="300" cy="80" r="3" fill="white" fillOpacity="0.3" />
      <path d="M 400 25 L 355 25 L 355 135 L 400 135" stroke="white" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M 400 55 L 380 55 L 380 105 L 400 105" stroke="white" strokeOpacity="0.2" strokeWidth="2.5" />
    </svg>
  );
}

export function GymScene() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 400 160"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden
    >
      <circle cx="380" cy="0" r="90" fill="white" opacity="0.07" />
      <circle cx="20" cy="160" r="70" fill="black" opacity="0.12" />

      {/* barbell, outlined like a diagram so it never fights with text/buttons */}
      <g transform="translate(330 82)" stroke="white" strokeOpacity="0.28" strokeWidth="2.5">
        <line x1="-70" y1="0" x2="70" y2="0" />
        <rect x="-82" y="-22" width="12" height="44" rx="4" />
        <rect x="-98" y="-30" width="12" height="60" rx="4" />
        <rect x="70" y="-22" width="12" height="44" rx="4" />
        <rect x="86" y="-30" width="12" height="60" rx="4" />
      </g>
    </svg>
  );
}
