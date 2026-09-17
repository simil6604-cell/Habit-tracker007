import { auth } from "@/lib/auth/auth";
import { buildBackup } from "@/lib/export/backup";

// Built per request from the signed-in account's own rows — never cached.
export const dynamic = "force-dynamic";

/**
 * Downloads everything this account holds as one .tar.gz.
 *
 * The middleware already requires a session here, and this checks again: a
 * route that hands over a whole account's data should not depend on a matcher
 * pattern staying correct.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Not found", { status: 404 });

  const backup = await buildBackup(userId);
  if (!backup) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(backup.body), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${backup.filename}"`,
      "Content-Length": String(backup.body.length),
      "X-Momentum-Rows": String(backup.summary.rows),
      "X-Momentum-Photos": String(backup.summary.photos),
      "X-Momentum-Missing-Photos": String(backup.summary.missingPhotos),
      "Cache-Control": "no-store",
    },
  });
}
