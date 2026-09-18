import { cn } from "@/lib/utils";

function statusFor(score: number) {
  if (score >= 70) return { label: "On track", dot: "bg-success", text: "text-success", ring: "ring-success/20", bg: "bg-success/10" };
  if (score >= 40) return { label: "Building", dot: "bg-warning", text: "text-warning", ring: "ring-warning/20", bg: "bg-warning/10" };
  return { label: "Needs focus", dot: "bg-danger", text: "text-danger", ring: "ring-danger/20", bg: "bg-danger/10" };
}

export function StatusPill({ score, className }: { score: number; className?: string }) {
  const s = statusFor(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1",
        s.bg,
        s.text,
        s.ring,
        className
      )}
      title={`Overall momentum: ${Math.round(score)}%`}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
