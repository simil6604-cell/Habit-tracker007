import path from "node:path";
import { UPLOAD_ROOT } from "@/lib/uploads/save-image";
import { backupStatus } from "@/lib/export/backup-status";
import type { AIHealth } from "@/lib/ai/health";

/**
 * One place that answers "is this set up properly?", in the terms the person
 * running it can act on.
 *
 * The app already knew most of this and said it in four different places: a
 * banner for the AI, a warning for the database, a button for the microphone,
 * a line for the backup. Nobody assembles four scattered signals into "yes,
 * this deployment is fine" — and the one failure that has actually bitten this
 * app, photos deleted by a deploy, was visible in none of them until the
 * photos were already gone.
 *
 * The checks that matter are about persistence: what survives the next deploy.
 * Everything here is phrased as a state plus the fix, never as a status code.
 */

export type CheckStatus = "ok" | "warn" | "fail";

export type SetupCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
};

/** True when `target` sits inside the app directory, which a deploy rebuilds. */
export function insideAppDirectory(target: string, cwd: string = process.cwd()): boolean {
  const relative = path.relative(cwd, path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Where photos are written. On a hosted deployment, inside the app directory
 * means they are deleted by the next deploy — the bug this app shipped once.
 */
export function photoStorageCheck(uploadRoot: string, isProduction: boolean, cwd?: string): SetupCheck {
  const inApp = insideAppDirectory(uploadRoot, cwd);

  if (isProduction && inApp) {
    return {
      id: "photo-storage",
      label: "Photo storage",
      status: "fail",
      detail: `Photos are written to ${uploadRoot}, inside the app directory. The next deploy rebuilds that directory and deletes every one of them, while the app keeps pointing at files that no longer exist.`,
      fix: "Set UPLOAD_DIR to a path on the persistent disk — on Render, /var/data/uploads — and redeploy.",
    };
  }

  return {
    id: "photo-storage",
    label: "Photo storage",
    status: "ok",
    detail: isProduction
      ? `Photos are written to ${uploadRoot}, outside the app directory, so a deploy leaves them alone.`
      : `Photos are written to ${uploadRoot}. On your own machine that is exactly right.`,
  };
}

/**
 * Rows and files can disagree. This compares them, which is the difference
 * between finding out now and finding out when you open an empty gallery.
 */
export function photoFilesCheck(total: number, missing: number): SetupCheck {
  if (total === 0) {
    return {
      id: "photo-files",
      label: "Photos on disk",
      status: "ok",
      detail: "No photos saved yet, so there is nothing that could have gone missing.",
    };
  }

  if (missing > 0) {
    return {
      id: "photo-files",
      label: "Photos on disk",
      status: "fail",
      detail: `${missing} of ${total} saved photo${total === 1 ? "" : "s"} ${missing === 1 ? "is" : "are"} missing from disk — the entry is still here, the picture is gone. This is what a deploy does when photos are stored inside the app directory.`,
      fix: "Fix the storage location first, then restore from your most recent backup — it carries the photo files as well as the data.",
    };
  }

  return {
    id: "photo-files",
    label: "Photos on disk",
    status: "ok",
    detail: `All ${total} saved photo${total === 1 ? "" : "s"} ${total === 1 ? "is" : "are"} where the app expects ${total === 1 ? "it" : "them"}.`,
  };
}

/** The same question for the database file, where the answer is everything else you own. */
export function databaseCheck(databaseUrl: string | undefined, isProduction: boolean, cwd?: string): SetupCheck {
  if (!databaseUrl?.startsWith("file:")) {
    return {
      id: "database",
      label: "Database",
      status: "ok",
      detail: "Not a file-based database, so a deploy cannot delete it.",
    };
  }

  const raw = databaseUrl.slice("file:".length);
  // Prisma resolves a relative path against the prisma/ directory, not the
  // working directory. Resolving it any other way checks a file that isn't there.
  const file = path.isAbsolute(raw) ? raw : path.resolve(cwd ?? process.cwd(), "prisma", raw);

  if (isProduction && insideAppDirectory(file, cwd)) {
    return {
      id: "database",
      label: "Database",
      status: "fail",
      detail: `The database is at ${file}, inside the app directory. Every account, subject, workout and match is deleted the next time this app deploys.`,
      fix: "Point DATABASE_URL at the persistent disk — on Render, file:/var/data/prod.db — and redeploy.",
    };
  }

  return {
    id: "database",
    label: "Database",
    status: "ok",
    detail: isProduction ? `The database is at ${file}, outside the app directory.` : `The database is at ${file}.`,
  };
}

/** Whether the AI can actually answer, said in terms of what to do about it. */
export function aiCheck(health: AIHealth): SetupCheck {
  if (health.ok) {
    return {
      id: "ai",
      label: "AI",
      status: "ok",
      detail: health.lastSuccessAt
        ? "Connected, and the last call went through."
        : "A key is configured. Nothing has called the AI yet on this server.",
    };
  }

  return {
    id: "ai",
    label: "AI",
    status: "warn",
    detail: health.problem ?? "The AI is not answering, so every AI feature is running on its built-in fallback.",
    fix: health.fix ?? undefined,
  };
}

/** The backup is the only thing here that protects you from the others being wrong. */
export function backupCheck(lastBackupAt: Date | string | null | undefined, now?: Date): SetupCheck {
  const status = backupStatus(lastBackupAt, now);

  if (status.kind === "never") {
    return {
      id: "backup",
      label: "Backup",
      status: "warn",
      detail: "You have never downloaded a backup, so this app is the only copy of everything in it.",
      fix: "Use “Download backup” below and keep the file somewhere else.",
    };
  }

  return {
    id: "backup",
    label: "Backup",
    status: status.stale ? "warn" : "ok",
    detail: status.stale
      ? `${status.label} — everything since then exists only here.`
      : `${status.label}, and it carries your photos as well as your data.`,
    fix: status.stale ? "Download a fresh one below." : undefined,
  };
}

/** The headline: what the whole list adds up to. */
export function summarize(checks: SetupCheck[]): { status: CheckStatus; label: string } {
  if (checks.some((check) => check.status === "fail")) {
    return { status: "fail", label: "Something here will lose data" };
  }
  if (checks.some((check) => check.status === "warn")) {
    return { status: "warn", label: "Working, with something worth fixing" };
  }
  return { status: "ok", label: "Everything checks out" };
}

export { UPLOAD_ROOT };
