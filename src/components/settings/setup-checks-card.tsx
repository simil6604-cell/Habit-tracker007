import type { SetupCheck, CheckStatus } from "@/lib/config/setup-checks";

const ICON: Record<CheckStatus, string> = { ok: "✅", warn: "⚠️", fail: "❌" };
const TEXT: Record<CheckStatus, string> = {
  ok: "text-muted",
  warn: "text-warning",
  fail: "text-danger",
};

/**
 * The whole deployment, in one card you can screenshot.
 *
 * Each row names a state and, when something is wrong, exactly what to change
 * — never a code, never "unhealthy". The point is that someone who did not
 * build this can read it and know whether their data is safe.
 */
export function SetupChecksCard({
  checks,
  summary,
}: {
  checks: SetupCheck[];
  summary: { status: CheckStatus; label: string };
}) {
  return (
    <div className="flex flex-col gap-3" data-testid="setup-checks">
      <p className={`text-sm font-medium ${summary.status === "ok" ? "text-success" : TEXT[summary.status]}`}>
        {ICON[summary.status]} {summary.label}
      </p>

      <ul className="flex flex-col gap-2">
        {checks.map((check) => (
          <li key={check.id} className="border-t border-border pt-2 first:border-0 first:pt-0">
            <p className="text-sm">
              <span aria-hidden>{ICON[check.status]}</span>{" "}
              <span className="font-medium">{check.label}</span>
              <span className="sr-only">: {check.status === "ok" ? "fine" : "needs attention"}</span>
            </p>
            <p className={`mt-0.5 text-xs ${TEXT[check.status]}`} data-testid={`check-${check.id}`}>
              {check.detail}
            </p>
            {check.fix && <p className="mt-0.5 text-xs text-accent">{check.fix}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
