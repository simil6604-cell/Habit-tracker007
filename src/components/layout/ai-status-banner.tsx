import Link from "next/link";
import { getAIHealth } from "@/lib/ai/health";
import { AlertTriangle } from "lucide-react";

/**
 * Says out loud when the AI isn't working.
 *
 * Without this the app degrades quietly: the tutor, quiz, summaries and coach
 * each fall back to their own rule-based logic, which is the right behaviour
 * but leaves you looking at worse answers with no idea why. The reason is
 * always known by then — it just had nowhere to go except a button in Settings
 * you had to already know about.
 *
 * Shown only when something is actually wrong, so it never becomes furniture.
 */
export function AIStatusBanner() {
  const health = getAIHealth();
  if (health.ok) return null;

  return (
    <div
      data-testid="ai-status-banner"
      className="border-b border-warning/30 bg-warning/10 px-4 py-2.5 sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-5xl flex-wrap items-start gap-x-3 gap-y-1 text-sm">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{health.problem}</p>
          {health.fix && <p className="text-xs text-muted">{health.fix}</p>}
        </div>
        <Link href="/settings" className="whitespace-nowrap text-xs font-medium text-accent hover:underline">
          Check it in Settings →
        </Link>
      </div>
    </div>
  );
}
