import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { restoreBackup } from "@/lib/export/restore";

export const dynamic = "force-dynamic";

/** A real backup of one person is far below this, photos and all. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Restores an uploaded backup into the signed-in account.
 *
 * A route handler rather than a server action on purpose: a backup carries
 * photos and runs to tens of megabytes, and server actions cap the request
 * body far below that. Here the upload arrives as an ordinary multipart POST.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ error: "Not signed in." }, { status: 401 });

  // Refused before the body is read into memory at all. The unpack limit in
  // the tar reader covers what a small file can expand into; this covers the
  // upload itself.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That file is too large to restore from." }, { status: 413 });
  }

  let file: unknown;
  try {
    file = (await request.formData()).get("backup");
  } catch {
    return Response.json({ error: "That upload didn't arrive in one piece — try again." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Pick your backup file first." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "That file is too large to restore from." }, { status: 413 });
  }

  let result;
  try {
    result = await restoreBackup(userId, Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    // A restore that fails halfway leaves the account partly filled, and
    // saying so is the only honest option — the user still has the file.
    return Response.json(
      {
        error: `The restore stopped partway through (${err instanceof Error ? err.message : "unknown error"}). Your backup file is unchanged — try it again, and if it keeps failing, don't add new data on top of a half-restored account.`,
      },
      { status: 500 }
    );
  }

  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  for (const route of ["/", "/school", "/gym", "/football", "/calendar", "/tasks", "/analytics", "/settings"]) {
    revalidatePath(route);
  }

  return Response.json({ rows: result.rows, photos: result.photos, ignored: result.ignored });
}
