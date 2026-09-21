/**
 * How old the last backup is, in the terms a person would use.
 *
 * The app can export everything it holds, and that is worth nothing if nobody
 * remembers to do it. So the date is kept and turned into a sentence: the
 * point is not the timestamp, it is whether the only copy of your school
 * years, training log and photos is the one on a server you don't control.
 */

/** After this long, the app stops stating the fact and starts suggesting. */
export const STALE_AFTER_DAYS = 30;

export type BackupStatus =
  | { kind: "never"; label: string; stale: true }
  | { kind: "done"; label: string; stale: boolean; days: number };

function daysBetween(then: Date, now: Date): number {
  // Calendar days, not 24-hour blocks: a backup made last night is "yesterday"
  // to the person who made it, whatever the clock says.
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(then)) / 86_400_000));
}

export function backupStatus(lastBackupAt: Date | string | null | undefined, now: Date = new Date()): BackupStatus {
  if (!lastBackupAt) {
    return { kind: "never", label: "You have never downloaded a backup", stale: true };
  }

  const then = lastBackupAt instanceof Date ? lastBackupAt : new Date(lastBackupAt);
  if (Number.isNaN(then.getTime())) {
    return { kind: "never", label: "You have never downloaded a backup", stale: true };
  }

  const days = daysBetween(then, now);
  const label =
    days === 0 ? "Last backup: today" : days === 1 ? "Last backup: yesterday" : `Last backup: ${days} days ago`;

  return { kind: "done", label, stale: days >= STALE_AFTER_DAYS, days };
}

/**
 * Whether the home page should raise the subject at all.
 *
 * Not on day one. A brand new account has nothing to lose yet, and an app that
 * nags from the first minute teaches you to ignore it — by the time the
 * warning means something, it has become furniture. So it waits until there is
 * a week of your life in there.
 */
export const NUDGE_AFTER_DAYS_OF_USE = 7;

export function shouldNudgeAboutBackup(
  lastBackupAt: Date | string | null | undefined,
  accountCreatedAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  const status = backupStatus(lastBackupAt, now);
  if (!status.stale) return false;

  const created = accountCreatedAt instanceof Date ? accountCreatedAt : new Date(accountCreatedAt ?? "");
  if (Number.isNaN(created.getTime())) return false;

  const daysOfUse = Math.floor((now.getTime() - created.getTime()) / 86_400_000);
  return daysOfUse >= NUDGE_AFTER_DAYS_OF_USE;
}
