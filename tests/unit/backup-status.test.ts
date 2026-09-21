import { describe, expect, it } from "vitest";
import {
  backupStatus,
  shouldNudgeAboutBackup,
  NUDGE_AFTER_DAYS_OF_USE,
  STALE_AFTER_DAYS,
} from "@/lib/export/backup-status";

const now = new Date("2026-09-21T09:00:00");
const daysAgo = (days: number, hour = 12) => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  date.setHours(hour, 0, 0, 0);
  return date;
};

describe("backupStatus", () => {
  it("says so plainly when there has never been one", () => {
    const status = backupStatus(null, now);
    expect(status.kind).toBe("never");
    expect(status.stale).toBe(true);
    expect(status.label).toMatch(/never/i);
  });

  it("counts calendar days, not 24-hour blocks", () => {
    // Made at 22:00 last night, read at 09:00 this morning: eleven hours, but
    // "yesterday" is what the person who made it would say.
    expect(backupStatus(daysAgo(1, 22), now).label).toBe("Last backup: yesterday");
    expect(backupStatus(daysAgo(0, 8), now).label).toBe("Last backup: today");
    expect(backupStatus(daysAgo(5), now).label).toBe("Last backup: 5 days ago");
  });

  it("turns from a fact into a nudge after a month", () => {
    expect(backupStatus(daysAgo(STALE_AFTER_DAYS - 1), now).stale).toBe(false);
    expect(backupStatus(daysAgo(STALE_AFTER_DAYS), now).stale).toBe(true);
    expect(backupStatus(daysAgo(365), now).stale).toBe(true);
  });

  it("treats a date in the future as today rather than as a negative age", () => {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const status = backupStatus(tomorrow, now);
    expect(status.kind).toBe("done");
    if (status.kind === "done") expect(status.days).toBe(0);
    expect(status.label).toBe("Last backup: today");
  });

  it("takes the ISO string a backup file would carry", () => {
    expect(backupStatus(daysAgo(2).toISOString(), now).label).toBe("Last backup: 2 days ago");
    expect(backupStatus("not a date", now).kind).toBe("never");
  });
});

describe("shouldNudgeAboutBackup", () => {
  const created = (days: number) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    return date;
  };

  it("stays quiet on a new account, however little it has been backed up", () => {
    // Nothing to lose yet, and an app that nags from day one is furniture by
    // the time the warning matters.
    expect(shouldNudgeAboutBackup(null, created(0), now)).toBe(false);
    expect(shouldNudgeAboutBackup(null, created(NUDGE_AFTER_DAYS_OF_USE - 1), now)).toBe(false);
  });

  it("speaks up once there is a week of your life in there and no backup", () => {
    expect(shouldNudgeAboutBackup(null, created(NUDGE_AFTER_DAYS_OF_USE), now)).toBe(true);
    expect(shouldNudgeAboutBackup(null, created(200), now)).toBe(true);
  });

  it("stays quiet while the backup is recent, however old the account", () => {
    expect(shouldNudgeAboutBackup(daysAgo(3), created(500), now)).toBe(false);
    expect(shouldNudgeAboutBackup(daysAgo(STALE_AFTER_DAYS - 1), created(500), now)).toBe(false);
  });

  it("speaks up again when the backup has gone stale", () => {
    expect(shouldNudgeAboutBackup(daysAgo(STALE_AFTER_DAYS), created(500), now)).toBe(true);
  });

  it("says nothing when it cannot tell how old the account is", () => {
    expect(shouldNudgeAboutBackup(null, null, now)).toBe(false);
    expect(shouldNudgeAboutBackup(null, "nonsense", now)).toBe(false);
  });
});
