export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="momentum-bg" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0b0c10" />
          <stop offset="1" stopColor="#16151f" />
        </linearGradient>
        <linearGradient id="momentum-bar1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
        <linearGradient id="momentum-bar2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fb923c" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id="momentum-bar3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4ade80" />
          <stop offset="1" stopColor="#22c55e" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" rx="24" fill="url(#momentum-bg)" />
      <rect x="24" y="52" width="13" height="24" rx="6" fill="url(#momentum-bar1)" />
      <rect x="43.5" y="38" width="13" height="38" rx="6" fill="url(#momentum-bar2)" />
      <rect x="63" y="24" width="13" height="52" rx="6" fill="url(#momentum-bar3)" />
    </svg>
  );
}
