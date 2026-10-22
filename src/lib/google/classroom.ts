import { CLASSROOM_API } from "./config";
import { GoogleError, GOOGLE_FAILURE_MESSAGE, type Fetcher } from "./oauth";

/**
 * Reading Google Classroom: courses, the work set in them, and this student's
 * own submissions.
 *
 * Everything is read-only and everything is "me" — the app asks Google for
 * this student's courses and this student's submissions, never a class list
 * and never anyone else's work.
 *
 * As with the OAuth half, `fetch` is injected: these shapes can then be tested
 * against what Google actually returns, including the refusals, without a
 * network and without a school account.
 */

export type ClassroomCourse = {
  id: string;
  name: string;
  section: string | null;
  link: string | null;
};

export type ClassroomWork = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  /** Null when the teacher set no date — common, and never invented here. */
  due: Date | null;
  maxPoints: number | null;
  link: string | null;
  workType: string | null;
};

export type ClassroomSubmission = {
  courseWorkId: string;
  state: string;
  late: boolean;
  grade: number | null;
};

/** Stops a runaway account from pulling thousands of rows in one sync. */
const MAX_PAGES = 10;
const PAGE_SIZE = 50;

type GoogleApiError = {
  error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] };
};

/**
 * Turns an API refusal into something true and actionable.
 *
 * The three that matter in practice: the project has the API switched off,
 * the account is not a Classroom user at all, and the granted permission does
 * not cover coursework. All three otherwise surface as an empty list, which
 * looks like "you have no homework" and is a lie.
 */
export function classifyApiError(status: number, body: GoogleApiError): GoogleError {
  const message = body.error?.message ?? "";
  const reason = body.error?.details?.find((d) => d.reason)?.reason ?? "";

  if (status === 429 || reason === "RATE_LIMIT_EXCEEDED") {
    return new GoogleError("RATE_LIMITED", GOOGLE_FAILURE_MESSAGE.RATE_LIMITED);
  }
  if (status === 401) {
    return new GoogleError("NEEDS_RECONNECT", GOOGLE_FAILURE_MESSAGE.NEEDS_RECONNECT);
  }
  if (reason === "SERVICE_DISABLED" || /has not been used in project|is disabled/i.test(message)) {
    return new GoogleError("API_NOT_ENABLED", GOOGLE_FAILURE_MESSAGE.API_NOT_ENABLED);
  }
  if (reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT" || /insufficient (authentication )?scope/i.test(message)) {
    return new GoogleError("MISSING_SCOPE", GOOGLE_FAILURE_MESSAGE.MISSING_SCOPE);
  }
  if (/@ClassroomDisabled|not a Classroom user|Requested entity was not found/i.test(message)) {
    return new GoogleError("NOT_A_CLASSROOM_USER", GOOGLE_FAILURE_MESSAGE.NOT_A_CLASSROOM_USER);
  }
  if (status === 403) {
    // A 403 with nothing recognisable in it, against a school account, is
    // overwhelmingly the administrator's policy rather than a bug here.
    return new GoogleError("ADMIN_BLOCKED", GOOGLE_FAILURE_MESSAGE.ADMIN_BLOCKED);
  }
  return new GoogleError("UNKNOWN", `${GOOGLE_FAILURE_MESSAGE.UNKNOWN} (HTTP ${status}${message ? `: ${message}` : ""})`);
}

async function get<T>(path: string, params: Record<string, string>, accessToken: string, doFetch: Fetcher): Promise<T> {
  const url = new URL(`${CLASSROOM_API}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await doFetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    let body: GoogleApiError = {};
    try {
      body = (await response.json()) as GoogleApiError;
    } catch {
      // A refusal with an unreadable body is still a refusal; the status
      // alone is enough to classify the common cases.
    }
    throw classifyApiError(response.status, body);
  }
  return (await response.json()) as T;
}

/** Follows nextPageToken, with a hard ceiling. */
async function getAllPages<T>(
  path: string,
  params: Record<string, string>,
  key: string,
  accessToken: string,
  doFetch: Fetcher
): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await get<Record<string, unknown>>(
      path,
      { ...params, pageSize: String(PAGE_SIZE), ...(pageToken ? { pageToken } : {}) },
      accessToken,
      doFetch
    );
    const items = (body[key] as T[] | undefined) ?? [];
    out.push(...items);
    pageToken = body.nextPageToken as string | undefined;
    if (!pageToken) break;
  }
  return out;
}

type RawCourse = { id?: string; name?: string; section?: string; alternateLink?: string };

export async function listCourses(accessToken: string, doFetch: Fetcher = fetch): Promise<ClassroomCourse[]> {
  const raw = await getAllPages<RawCourse>(
    "/courses",
    { studentId: "me", courseStates: "ACTIVE" },
    "courses",
    accessToken,
    doFetch
  );
  return raw
    .filter((c): c is RawCourse & { id: string } => Boolean(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name?.trim() || "Untitled course",
      section: c.section?.trim() || null,
      link: c.alternateLink ?? null,
    }));
}

type RawDate = { year?: number; month?: number; day?: number };
type RawTime = { hours?: number; minutes?: number };
type RawWork = {
  id?: string;
  title?: string;
  description?: string;
  dueDate?: RawDate;
  dueTime?: RawTime;
  maxPoints?: number;
  alternateLink?: string;
  workType?: string;
  state?: string;
};

/**
 * Classroom's split date and time, as one instant.
 *
 * Both parts are UTC. When a teacher sets a day but no time, Classroom treats
 * it as the end of that day, so that is what this produces — not midnight,
 * which would make everything due the night before and mark it late a day
 * early.
 */
export function parseDue(date: RawDate | undefined, time: RawTime | undefined): Date | null {
  if (!date?.year || !date.month || !date.day) return null;
  const hours = time?.hours ?? 23;
  const minutes = time?.minutes ?? 59;
  const due = new Date(Date.UTC(date.year, date.month - 1, date.day, hours, minutes));
  return Number.isNaN(due.getTime()) ? null : due;
}

export async function listCourseWork(
  courseId: string,
  accessToken: string,
  doFetch: Fetcher = fetch
): Promise<ClassroomWork[]> {
  const raw = await getAllPages<RawWork>(
    `/courses/${encodeURIComponent(courseId)}/courseWork`,
    { courseWorkStates: "PUBLISHED" },
    "courseWork",
    accessToken,
    doFetch
  );
  return raw
    .filter((w): w is RawWork & { id: string } => Boolean(w.id))
    .map((w) => ({
      id: w.id,
      courseId,
      title: w.title?.trim() || "Untitled work",
      description: w.description?.trim() || null,
      due: parseDue(w.dueDate, w.dueTime),
      maxPoints: typeof w.maxPoints === "number" ? w.maxPoints : null,
      link: w.alternateLink ?? null,
      workType: w.workType ?? null,
    }));
}

type RawSubmission = { courseWorkId?: string; state?: string; late?: boolean; assignedGrade?: number };

/**
 * This student's submissions for a whole course in one call.
 *
 * The "-" stands in for every piece of coursework, which is the difference
 * between one request per course and one per assignment.
 */
export async function listSubmissions(
  courseId: string,
  accessToken: string,
  doFetch: Fetcher = fetch
): Promise<ClassroomSubmission[]> {
  const raw = await getAllPages<RawSubmission>(
    `/courses/${encodeURIComponent(courseId)}/courseWork/-/studentSubmissions`,
    { userId: "me" },
    "studentSubmissions",
    accessToken,
    doFetch
  );
  return raw
    .filter((s): s is RawSubmission & { courseWorkId: string } => Boolean(s.courseWorkId))
    .map((s) => ({
      courseWorkId: s.courseWorkId,
      state: s.state ?? "NEW",
      late: Boolean(s.late),
      grade: typeof s.assignedGrade === "number" ? s.assignedGrade : null,
    }));
}
