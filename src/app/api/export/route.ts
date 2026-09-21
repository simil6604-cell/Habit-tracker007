import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
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

  // Recorded only once the archive exists: a failed export is not a backup,
  // and a date that says otherwise is worse than no date at all.
  await prisma.user.update({ where: { id: userId }, data: { lastBackupAt: new Date() } });

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
