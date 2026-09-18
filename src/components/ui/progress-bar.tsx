import { cn, clamp } from "@/lib/utils";

export function ProgressBar({
  value,
  className,
  colorClassName = "bg-accent",
  trackClassName = "bg-surface-muted",
  size = "md",
}: {
  value: number;
  className?: string;
  colorClassName?: string;
  trackClassName?: string;
  size?: "sm" | "md" | "lg";
}) {
  const v = clamp(value);
  const height = size === "sm" ? "h-1.5" : size === "lg" ? "h-3" : "h-2";
  return (
    <div className={cn("w-full overflow-hidden rounded-full", height, trackClassName, className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", colorClassName)}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function ScoreRow({
  label,
  value,
  colorClassName,
}: {
  label: string;
  value: number;
  colorClassName?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted">{label}</span>
      <ProgressBar value={value} className="flex-1" colorClassName={colorClassName} />
      <span className="w-10 shrink-0 text-right font-medium tabular-nums">{Math.round(value)}%</span>
    </div>
  );
}
