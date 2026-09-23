import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { UPLOAD_ROOT } from "@/lib/uploads/save-image";
import { readTarGz, type TarEntry } from "./tar";

/**
 * Puts a downloaded backup back into the signed-in account.
 *
 * A backup you cannot restore is a file, not a safety net, so this is the
 * other half of the export. It restores into whoever is signed in — after a
 * lost disk that is a brand new account, which is the case that matters — and
 * replaces what that account currently holds, because merging two versions of
 * the same row silently is how you end up with a diary that is subtly wrong
 * and no way to tell which half is which.
 *
 * Every row is written under a fresh id, with its parent references rewritten
 * to match. Keeping the original ids would read more naturally, and works
 * exactly until the rows it came from still exist — restoring one account's
 * backup into a second account on the same database then collides on the
 * primary key. A new id costs nothing and never collides.
 *
 * Everything in the archive is treated as hostile. It arrived as a file
 * upload, so its filenames are never joined onto a path (a photo called
 * `../../etc/cron.d/x` is exactly the attack), its ids are written only under
 * the signed-in user, and its photo paths are rewritten to this account
 * rather than trusted.
 */

const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const MAX_PHOTOS = 2000;
const PHOTO_NAME = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]{2,5}$/;

export type ParsedBackup = { data: Record<string, unknown>; photos: Map<string, Buffer>; ignored: string[] };
export type ParseResult = { ok: true; backup: ParsedBackup } | { ok: false; error: string };
export type RestoreResult =
  | { ok: true; rows: number; photos: number; ignored: string[] }
  | { ok: false; error: string };

/**
 * Relation fields by name, used only to decide what an *empty* value means.
 *
 * A relation holding an object or a list is recognisable by its value, but an
 * empty one comes back as `null` and looks exactly like a nullable column —
 * and Prisma rejects `school: null` on a create, which is how the first
 * version of this failed. Dropping those names outright is wrong too:
 * `Flashcard.topic` is a plain string column that happens to share a name with
 * a relation, and dropping it lost the label on every restored card. So a name
 * on this list is dropped when it is null or an object, and kept when it holds
 * an actual value.
 */
const RELATION_KEYS = new Set([
  "user",
  "school",
  "subject",
  "subjects",
  "topic",
  "topics",
  "habit",
  "logs",
  "workout",
  "workouts",
  "exercise",
  "exercises",
  "session",
  "sessions",
  "setLogs",
  "profile",
  "profiles",
  "team",
  "standings",
  "trainings",
  "matches",
  "timetableSlots",
  "learningLog",
  "accounts",
]);

/** The part of a row Prisma can be handed: its own scalar fields. */
export function scalars(row: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    // The children are restored by name, in order, so a nested copy here would
    // only confuse Prisma. Every Json column in this schema is stored as a
    // string, so nothing real is lost.
    if (value !== null && typeof value === "object") continue;
    if (value === null && RELATION_KEYS.has(key)) continue;
    out[key] = value;
  }
  return { ...out, ...extra };
}

function omit(row: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
}

/**
 * Reads the archive: the data file, and the photos by their bare filename.
 * Anything else in it — a path that tries to climb out, a name this app would
 * never write, a second data file — is left out and named in `ignored`.
 */
export function parseBackup(archive: Buffer): ParseResult {
  if (archive.length === 0) return { ok: false, error: "That file is empty." };
  if (archive.length > MAX_ARCHIVE_BYTES) return { ok: false, error: "That backup is larger than this app can read." };

  let entries: TarEntry[];
  try {
    entries = readTarGz(archive);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "That file couldn't be read as a backup." };
  }

  const ignored: string[] = [];
  const photos = new Map<string, Buffer>();
  let dataEntry: TarEntry | null = null;

  for (const entry of entries) {
    // The archive has one folder at the top; take the path inside it.
    const segments = entry.name.split("/").filter((segment) => segment !== "" && segment !== ".");
    const inner = segments.slice(1);

    if (inner.length === 1 && inner[0] === "data.json" && !dataEntry) {
      dataEntry = entry;
      continue;
    }
    if (inner.length === 1 && inner[0] === "README.txt") continue;

    // Photos: exactly `photos/<one safe filename>`. The name is never joined
    // onto a path before it has passed this.
    if (inner.length === 2 && inner[0] === "photos" && PHOTO_NAME.test(inner[1])) {
      if (photos.size >= MAX_PHOTOS) {
        ignored.push(entry.name);
        continue;
      }
      photos.set(inner[1], entry.body);
      continue;
    }

    ignored.push(entry.name);
  }

  if (!dataEntry) return { ok: false, error: "That backup has no data.json in it — is it a Momentum backup?" };

  let data: unknown;
  try {
    data = JSON.parse(dataEntry.body.toString("utf8"));
  } catch {
    return { ok: false, error: "The data file inside that backup isn't readable." };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "The data file inside that backup isn't in the expected shape." };
  }
  const record = data as Record<string, unknown>;
  if (typeof record.email !== "string" || typeof record.id !== "string") {
    return { ok: false, error: "That doesn't look like a Momentum backup — it has no account in it." };
  }

  return { ok: true, backup: { data: record, photos, ignored } };
}

/** The string entries of a JSON-array column, or none if it isn't one. */
function jsonPaths(stored: string): string[] {
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

/** `/uploads/<whoever>/<file>` → the same file under the account restoring it. */
function rewriteImagePath(imagePath: unknown, userId: string, photos: Map<string, Buffer>): string | null {
  if (typeof imagePath !== "string") return null;
  const filename = imagePath.split("/").pop() ?? "";
  if (!PHOTO_NAME.test(filename)) return null;
  // A path to a photo the archive doesn't carry would render as a broken
  // image, so the row keeps its caption and date and loses the picture.
  if (!photos.has(filename)) return null;
  return `/uploads/${userId}/${filename}`;
}

/**
 * Removes everything the account currently holds. Children go with their
 * parents, except the timetable, which no cascade reaches.
 *
 * Runs on the caller's transaction, not its own: a restore that wiped in one
 * transaction and then wrote in none would leave the account destroyed the
 * moment any single row failed.
 */
async function wipe(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  // TimetableSlot has no relation to User, so nothing cascades to it, and its
  // link to Subject is SetNull — without this the old timetable survives a
  // "replaces everything" restore and the new one stacks on top of it.
  await tx.timetableSlot.deleteMany({ where: { userId } });
  await tx.subject.deleteMany({ where: { userId } });
  await tx.school.deleteMany({ where: { userId } });
  await tx.homework.deleteMany({ where: { userId } });
  await tx.exam.deleteMany({ where: { userId } });
  await tx.studySession.deleteMany({ where: { userId } });
  await tx.flashcard.deleteMany({ where: { userId } });
  await tx.schoolHabit.deleteMany({ where: { userId } });
  await tx.learningLogEntry.deleteMany({ where: { userId } });
  await tx.notePhoto.deleteMany({ where: { userId } });
  await tx.classRecording.deleteMany({ where: { userId } });
  await tx.tutorMessage.deleteMany({ where: { userId } });
  await tx.workoutSession.deleteMany({ where: { userId } });
  await tx.workout.deleteMany({ where: { userId } });
  await tx.meal.deleteMany({ where: { userId } });
  await tx.waterLog.deleteMany({ where: { userId } });
  await tx.bodyWeightLog.deleteMany({ where: { userId } });
  await tx.bodyPhoto.deleteMany({ where: { userId } });
  await tx.scannedProduct.deleteMany({ where: { userId } });
  await tx.footballProfile.deleteMany({ where: { userId } });
  await tx.goal.deleteMany({ where: { userId } });
  await tx.task.deleteMany({ where: { userId } });
  await tx.calendarEvent.deleteMany({ where: { userId } });
  await tx.aIRecommendation.deleteMany({ where: { userId } });
  await tx.progress.deleteMany({ where: { userId } });
  await tx.chatMessage.deleteMany({ where: { userId } });
  await tx.schoolAIMessage.deleteMany({ where: { userId } });
  await tx.drillVideo.deleteMany({ where: { userId } });
  await tx.assessment.deleteMany({ where: { userId } });
}

export async function restoreBackup(userId: string, archive: Buffer): Promise<RestoreResult> {
  const parsed = parseBackup(archive);
  if (!parsed.ok) return parsed;
  const { data, photos, ignored } = parsed.backup;

  const owned = { userId };
  let written = 0;

  /**
   * Old id -> the id the row is written under now. Ids are unique across every
   * table here, so one map covers all of them, and a parent is "present"
   * exactly when its old id is in it.
   */
  const ids = new Map<string, string>();

  /** Gives a row a fresh id and remembers what it used to be called. */
  function withNewId(row: Record<string, unknown>): Record<string, unknown> {
    const fresh = randomUUID();
    if (typeof row.id === "string") ids.set(row.id, fresh);
    row.id = fresh;
    return row;
  }

  /**
   * Points a foreign key at the restored parent. Returns false when the parent
   * is not in this backup: the caller then skips the row, or clears the key if
   * the relation is optional, rather than pointing it at something arbitrary.
   */
  function link(row: Record<string, unknown>, key: string): boolean {
    const old = row[key];
    if (typeof old !== "string") return false;
    const mapped = ids.get(old);
    if (!mapped) return false;
    row[key] = mapped;
    return true;
  }

  async function create(
    write: (row: Record<string, unknown>) => Promise<unknown>,
    row: Record<string, unknown>
  ): Promise<void> {
    await write(row);
    written++;
  }

  /**
   * One transaction for the whole rewrite. The wipe used to commit on its own
   * and everything after it ran unprotected, so a single row Prisma refused —
   * a data.json from a newer version of the app, say — left the account
   * emptied with nothing written back. Now either all of it lands or none of
   * it does, and the file is still on the user's disk either way.
   *
   * The timeout is generous because this writes a whole account's history row
   * by row, and the default five seconds is a limit on the restore, not on
   * anything going wrong.
   */
  await prisma.$transaction(
    async (tx) => {
    await wipe(tx, userId);

    // The account's own settings. Never the email or the password: this restores
    // data into whoever is signed in, it does not turn them into someone else.
    const profile = scalars(data);
    if (profile) {
      const settings = omit(profile, ["id", "email", "passwordHash", "emailVerified", "createdAt", "footballProfile"]);
      await tx.user.update({ where: { id: userId }, data: settings });
    }

    const school = scalars(data.school, owned);
    if (school) {
      await create((row) => tx.school.create({ data: row as never }), { ...omit(school, ["id"]), userId });
    }

    // Parents before children, and a child whose parent didn't make it is
    // skipped rather than re-parented to something arbitrary.
    for (const subject of rows(data.subjects)) {
      const row = scalars(subject, owned);
      if (!row) continue;
      await create((r) => tx.subject.create({ data: r as never }), withNewId(row));
    }

    for (const subject of rows(data.subjects)) {
      for (const topic of rows(subject.topics)) {
        const row = scalars(topic);
        if (!row || !link(row, "subjectId")) continue;
        await create((r) => tx.topic.create({ data: r as never }), withNewId(row));
      }
    }

    /**
     * The timetable, from the top-level list this app now exports and from the
     * per-subject lists older archives carry, by id so nothing is written
     * twice.
     *
     * `owned` is the part that matters. Every other row is tied to the account
     * by a foreign key Prisma would refuse to get wrong; TimetableSlot has a
     * plain userId column and no relation, so writing the backup's userId
     * succeeds silently and every timetable query — all of which filter on
     * userId — then returns nothing. The rows are there, counted as restored,
     * and the timetable is blank.
     */
    const slotsById = new Map<string, Record<string, unknown>>();
    for (const slot of [...rows(data.timetableSlots), ...rows(data.subjects).flatMap((s) => rows(s.timetableSlots))]) {
      if (typeof slot.id === "string" && !slotsById.has(slot.id)) slotsById.set(slot.id, slot);
    }
    for (const slot of slotsById.values()) {
      const row = scalars(slot, owned);
      if (!row) continue;
      if (!link(row, "subjectId")) row.subjectId = null;
      await create((r) => tx.timetableSlot.create({ data: r as never }), withNewId(row));
    }

    for (const [key, write] of [
      ["homework", (row: Record<string, unknown>) => tx.homework.create({ data: row as never })],
      ["exams", (row: Record<string, unknown>) => tx.exam.create({ data: row as never })],
      ["studySessions", (row: Record<string, unknown>) => tx.studySession.create({ data: row as never })],
    ] as const) {
      for (const entry of rows(data[key])) {
        const row = scalars(entry, owned);
        if (!row) continue;
        if (!link(row, "subjectId")) row.subjectId = null;
        await create(write, withNewId(row));
      }
    }

    for (const habit of rows(data.schoolHabits)) {
      const row = scalars(habit, owned);
      if (!row) continue;
      await create((r) => tx.schoolHabit.create({ data: r as never }), withNewId(row));
      for (const log of rows(habit.logs)) {
        const logRow = scalars(log);
        if (!logRow || !link(logRow, "habitId")) continue;
        await create((r) => tx.schoolHabitLog.create({ data: r as never }), withNewId(logRow));
      }
    }

    // The topic-level lists are restored from the top-level copies, which the
    // export includes precisely so an entry whose topic is gone still survives.
    for (const [key, write] of [
      ["learningLogEntries", (row: Record<string, unknown>) => tx.learningLogEntry.create({ data: row as never })],
      ["classRecordings", (row: Record<string, unknown>) => tx.classRecording.create({ data: row as never })],
      ["tutorMessages", (row: Record<string, unknown>) => tx.tutorMessage.create({ data: row as never })],
    ] as const) {
      for (const entry of rows(data[key])) {
        const row = scalars(entry, owned);
        if (!row || !link(row, "topicId")) continue;
        await create(write, withNewId(row));
      }
    }

    /**
     * Flashcards come after the learning log on purpose: a card generated from
     * something you marked as not understood remembers which entry it came
     * from, and that is what stops "generate from what I didn't understand"
     * making a second copy of every card. Restored before the entries, the
     * link would point at an id that no longer exists and every card would be
     * generated again.
     */
    for (const entry of rows(data.flashcards)) {
      const row = scalars(entry, owned);
      if (!row) continue;
      if (!link(row, "subjectId")) row.subjectId = null;
      if (row.sourceLogEntryId != null && !link(row, "sourceLogEntryId")) row.sourceLogEntryId = null;
      await create((r) => tx.flashcard.create({ data: r as never }), withNewId(row));
    }

    for (const entry of rows(data.notePhotos)) {
      const row = scalars(entry, owned);
      if (!row || !link(row, "topicId")) continue;
      const rewritten = rewriteImagePath(row.imagePath, userId, photos);
      // A note photo is its picture — without the file there is nothing to show.
      if (!rewritten) continue;
      await create((r) => tx.notePhoto.create({ data: r as never }), withNewId({ ...row, imagePath: rewritten }));
    }

    for (const workout of rows(data.workouts)) {
      const row = scalars(workout, owned);
      if (!row) continue;
      await create((r) => tx.workout.create({ data: r as never }), withNewId(row));
      for (const exercise of rows(workout.exercises)) {
        const exerciseRow = scalars(exercise);
        if (!exerciseRow || !link(exerciseRow, "workoutId")) continue;
        await create((r) => tx.exercise.create({ data: r as never }), withNewId(exerciseRow));
      }
    }

    for (const session of rows(data.workoutSessions)) {
      const row = scalars(session, owned);
      if (!row) continue;
      if (!link(row, "workoutId")) row.workoutId = null;
      await create((r) => tx.workoutSession.create({ data: r as never }), withNewId(row));
      for (const log of rows(session.setLogs)) {
        const logRow = scalars(log);
        if (!logRow) continue;
        if (!link(logRow, "sessionId") || !link(logRow, "exerciseId")) continue;
        await create((r) => tx.setLog.create({ data: r as never }), withNewId(logRow));
      }
    }

    for (const meal of rows(data.meals)) {
      const row = scalars(meal, owned);
      if (!row) continue;
      // A meal is still a meal without its photo, so the row is kept either way.
      row.imagePath = rewriteImagePath(row.imagePath, userId, photos);
      await create((r) => tx.meal.create({ data: r as never }), withNewId(row));
    }

    for (const photo of rows(data.bodyPhotos)) {
      const row = scalars(photo, owned);
      if (!row) continue;
      const rewritten = rewriteImagePath(row.imagePath, userId, photos);
      if (!rewritten) continue;
      await create((r) => tx.bodyPhoto.create({ data: r as never }), withNewId({ ...row, imagePath: rewritten }));
    }

    for (const [key, write] of [
      ["waterLogs", (row: Record<string, unknown>) => tx.waterLog.create({ data: row as never })],
      ["weightLogs", (row: Record<string, unknown>) => tx.bodyWeightLog.create({ data: row as never })],
      ["scannedProducts", (row: Record<string, unknown>) => tx.scannedProduct.create({ data: row as never })],
      ["goals", (row: Record<string, unknown>) => tx.goal.create({ data: row as never })],
      ["tasks", (row: Record<string, unknown>) => tx.task.create({ data: row as never })],
      ["calendarEvents", (row: Record<string, unknown>) => tx.calendarEvent.create({ data: row as never })],
      ["recommendations", (row: Record<string, unknown>) => tx.aIRecommendation.create({ data: row as never })],
      ["progressEntries", (row: Record<string, unknown>) => tx.progress.create({ data: row as never })],
      ["chatMessages", (row: Record<string, unknown>) => tx.chatMessage.create({ data: row as never })],
      ["drillVideos", (row: Record<string, unknown>) => tx.drillVideo.create({ data: row as never })],
      ["assessments", (row: Record<string, unknown>) => tx.assessment.create({ data: row as never })],
    ] as const) {
      for (const entry of rows(data[key])) {
        const row = scalars(entry, owned);
        if (!row) continue;
        await create(write, withNewId(row));
      }
    }

    // A school-AI question can carry a dozen photos in one JSON column, so its
    // paths are rewritten as a list rather than one at a time. A photo the
    // archive doesn't carry drops out and the question keeps the rest, the same
    // rule every other photo row follows.
    for (const message of rows(data.schoolAIMessages)) {
      const row = scalars(message, owned);
      if (!row) continue;
      const kept =
        typeof row.imagePaths === "string"
          ? jsonPaths(row.imagePaths)
              .map((path) => rewriteImagePath(path, userId, photos))
              .filter((path): path is string => path !== null)
          : [];
      await create(
        (r) => tx.schoolAIMessage.create({ data: r as never }),
        withNewId({ ...row, imagePaths: kept.length > 0 ? JSON.stringify(kept) : null })
      );
    }

    const football = data.footballProfile;
    if (football && typeof football === "object" && !Array.isArray(football)) {
      const profileRow = scalars(football, owned);
      const teamSource = (football as Record<string, unknown>).team;
      const teamRow = scalars(teamSource);

      if (profileRow) {
        if (teamRow && typeof teamRow.id === "string") {
          // A team row is shared between teammates, so it may already exist.
          // Then it is joined rather than duplicated, and its standings are left
          // exactly as they are — they are not this backup's to overwrite.
          const existing = await tx.footballTeam.findUnique({ where: { id: teamRow.id } });
          if (existing) {
            ids.set(teamRow.id, existing.id);
          } else {
            const oldTeamId = teamRow.id;
            await create((r) => tx.footballTeam.create({ data: r as never }), withNewId(teamRow));
            for (const standing of rows((teamSource as Record<string, unknown>).standings)) {
              const row = scalars(standing);
              if (!row || row.teamId !== oldTeamId || !link(row, "teamId")) continue;
              await create((r) => tx.teamStanding.create({ data: r as never }), withNewId(row));
            }
          }
        }

        if (!link(profileRow, "teamId")) profileRow.teamId = null;
        const oldProfileId = profileRow.id;
        await create((r) => tx.footballProfile.create({ data: r as never }), withNewId(profileRow));

        for (const [key, write] of [
          ["trainings", (row: Record<string, unknown>) => tx.footballTraining.create({ data: row as never })],
          ["matches", (row: Record<string, unknown>) => tx.footballMatch.create({ data: row as never })],
        ] as const) {
          for (const entry of rows((football as Record<string, unknown>)[key])) {
            const row = scalars(entry);
            if (!row || row.profileId !== oldProfileId || !link(row, "profileId")) continue;
            await create(write, withNewId(row));
          }
        }
      }
    }
    },
    { timeout: 180_000, maxWait: 20_000 }
  );

  // The files last: a photo on disk with no row is invisible, a row with no
  // file is a broken image, and the rows above only kept paths for files this
  // archive actually carries.
  const userDir = path.join(UPLOAD_ROOT, userId);
  await mkdir(userDir, { recursive: true });
  let restoredPhotos = 0;
  for (const [filename, body] of photos) {
    // Validated on the way in, and validated again here: this is the one place
    // a name from the archive touches the filesystem.
    if (!PHOTO_NAME.test(filename)) continue;
    await writeFile(path.join(userDir, filename), body);
    restoredPhotos++;
  }

  return { ok: true, rows: written, photos: restoredPhotos, ignored };
}
