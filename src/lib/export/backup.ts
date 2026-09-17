import { prisma } from "@/lib/db/prisma";
import { readUploadedImage } from "@/lib/uploads/save-image";
import { createTarGz, type TarEntry } from "./tar";

/**
 * Everything one account holds, in one file you can keep.
 *
 * The app's data lives in a single database file on a single disk, and the
 * photos next to it. That is fine until the day it isn't, and nothing in the
 * app could get any of it back out — so this exists before it is needed rather
 * than after.
 *
 * What it deliberately leaves out: the password hash and the sign-in rows
 * (accounts, sessions). Those are credentials, not your data; a backup you
 * might email to yourself should not carry them.
 */

const EXCLUDED = new Set(["passwordHash", "accounts", "sessions"]);

export type BackupSummary = { rows: number; photos: number; missingPhotos: number };

/** Every stored image path in the export, in the order they appear. */
function collectPhotoPaths(data: Record<string, unknown>): string[] {
  const found: string[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key === "imagePath" && typeof child === "string" && child.startsWith("/uploads/")) found.push(child);
        else walk(child);
      }
    }
  };
  walk(data);
  return [...new Set(found)];
}

/** Rows, counted for the confirmation message — a backup that says "0 rows" is a warning. */
function countRows(value: unknown): number {
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + countRows(item), 0);
  if (value && typeof value === "object") {
    let count = 1;
    for (const child of Object.values(value as Record<string, unknown>)) {
      if (child && typeof child === "object") count += countRows(child);
    }
    return count;
  }
  return 0;
}

/**
 * Drops the excluded keys anywhere in the tree and turns dates into ISO
 * strings. Exported so the "a backup carries no credentials" promise is a test
 * and not a comment.
 */
export function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !EXCLUDED.has(key))
        .map(([key, child]) => [key, stripSensitive(child)])
    );
  }
  return value;
}

export async function loadBackupData(userId: string): Promise<Record<string, unknown> | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      school: true,
      subjects: {
        include: {
          timetableSlots: true,
          topics: { include: { learningLog: true, notePhotos: true, classRecordings: true, tutorMessages: true } },
        },
      },
      homework: true,
      exams: true,
      studySessions: true,
      flashcards: true,
      schoolHabits: { include: { logs: true } },
      workouts: { include: { exercises: true } },
      workoutSessions: { include: { setLogs: true } },
      meals: true,
      waterLogs: true,
      weightLogs: true,
      bodyPhotos: true,
      scannedProducts: true,
      footballProfile: {
        include: { trainings: true, matches: true, team: { include: { standings: true } } },
      },
      goals: true,
      tasks: true,
      calendarEvents: true,
      recommendations: true,
      progressEntries: true,
      chatMessages: true,
      assessments: true,
      // These hang off topics as well, and are included there. Kept at the top
      // level too so an entry whose topic was deleted is still in the backup.
      learningLogEntries: true,
      notePhotos: true,
      classRecordings: true,
      tutorMessages: true,
    },
  });

  if (!user) return null;
  return stripSensitive(user) as Record<string, unknown>;
}

/**
 * Builds the archive: `data.json` plus every photo the data refers to.
 *
 * A photo whose file is gone (deleted by a deploy before UPLOAD_DIR was set,
 * say) is counted and named in the archive's own README rather than silently
 * dropped — an export that quietly loses pictures is worse than one that says
 * which ones it could not find.
 */
export async function buildBackup(
  userId: string,
  today = new Date()
): Promise<{ filename: string; body: Buffer; summary: BackupSummary } | null> {
  const data = await loadBackupData(userId);
  if (!data) return null;

  const stamp = today.toISOString().slice(0, 10);
  const root = `momentum-backup-${stamp}`;
  const entries: TarEntry[] = [
    { name: `${root}/data.json`, body: Buffer.from(JSON.stringify(data, null, 2), "utf8"), mtime: today },
  ];

  const missing: string[] = [];
  let photos = 0;
  for (const imagePath of collectPhotoPaths(data)) {
    const file = await readUploadedImage(imagePath);
    const filename = imagePath.split("/").pop();
    if (!file || !filename) {
      missing.push(imagePath);
      continue;
    }
    entries.push({ name: `${root}/photos/${filename}`, body: file, mtime: today });
    photos++;
  }

  const summary: BackupSummary = { rows: countRows(data), photos, missingPhotos: missing.length };

  entries.push({
    name: `${root}/README.txt`,
    body: Buffer.from(
      [
        `Momentum backup — ${stamp}`,
        "",
        `data.json  every row this account holds (${summary.rows}), without the password or sign-in data`,
        `photos/    ${photos} image${photos === 1 ? "" : "s"}; data.json refers to them by the filename`,
        "",
        missing.length
          ? `${missing.length} photo file${missing.length === 1 ? " was" : "s were"} referred to by the data but not found on disk:\n${missing.map((p) => `  ${p}`).join("\n")}`
          : "Every photo referred to by the data was found and is included.",
        "",
      ].join("\n"),
      "utf8"
    ),
    mtime: today,
  });

  return { filename: `${root}.tar.gz`, body: createTarGz(entries), summary };
}
