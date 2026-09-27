/**
 * A meter: one value against its limit, drawn as a ring.
 *
 * Deliberately not a chart. The number in the middle is the thing being read —
 * the ring is what makes "most of the way there" legible in the half-second
 * before anyone reads the digits. So the value is labelled directly rather
 * than left to the arc, which is also what keeps it readable for anyone who
 * can't tell the fill from the track.
 *
 * One hue against a neutral track, the same pair the rest of the app uses for
 * progress, so a ring and a bar on the same screen mean the same thing.
 */
export function ProgressRing({
  pct,
  value,
  label,
  size = 132,
  stroke = 10,
}: {
  pct: number;
  value: string;
  label: string;
  size?: number;
  stroke?: number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = (clamped / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--surface-muted)"
          strokeWidth={stroke}
        />
        {/* A round cap on a zero-length arc draws a dot floating at the top,
            which reads as a rendering glitch rather than as "none of it yet".
            At zero the track alone says it, and the number says the rest. */}
        {filled > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--cat-school)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference - filled}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-semibold leading-none tracking-tight tabular-nums">{value}</span>
        <span className="mt-1.5 max-w-[80%] text-[10px] font-medium uppercase leading-tight tracking-wider text-muted">
          {label}
        </span>
      </div>
    </div>
  );
}
