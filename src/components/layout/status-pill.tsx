import { cn } from "@/lib/utils";

function statusFor(score: number) {
  if (score >= 70) return { label: "On track", dot: "bg-success", text: "text-success", ring: "ring-success/20", bg: "bg-success/10" };
  if (score >= 40) return { label: "Building", dot: "bg-warning", text: "text-warning", ring: "ring-warning/20", bg: "bg-warning/10" };
  return { label: "Needs focus", dot: "bg-danger", text: "text-danger", ring: "ring-danger/20", bg: "bg-danger/10" };
}

export function StatusPill({ score, className }: { score: number | null; className?: string }) {
  // Null means nothing is set up yet. Reading that as 0 would put a red
  // "Needs focus" on an account that has not been asked to do anything.
  if (score === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-muted ring-1 ring-border",
          className
        )}
        title="No subjects, workouts or football profile yet — there is nothing to score."
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
        Not set up yet
      </span>
    );
  }

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
