import { readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/lib/auth/auth";
import { UPLOAD_ROOT, LEGACY_UPLOAD_ROOT } from "@/lib/uploads/save-image";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

/**
 * Serves an uploaded photo.
 *
 * Uploads live outside `public/` so they can sit on a persistent disk and
 * survive a deploy, which means they need serving explicitly. That turns out
 * to be worth having anyway: a static file under `public/` is readable by
 * anyone who has the URL, and body progress photos are not something to hand
 * out on a guessable link. Here the request has to be signed in, and the photo
 * has to belong to whoever is asking.
 */
export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const segments = (await context.params).path ?? [];
  // Exactly <userId>/<filename>: anything else isn't a shape this app writes.
  if (segments.length !== 2) return new Response("Not found", { status: 404 });
  const [ownerId, filename] = segments;
  if (ownerId !== userId) return new Response("Not found", { status: 404 });

  const ext = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return new Response("Not found", { status: 404 });

  for (const root of [UPLOAD_ROOT, LEGACY_UPLOAD_ROOT]) {
    const resolved = path.resolve(root, ownerId, filename);
    // Belt and braces after the checks above: never read outside the root,
    // whatever the segments turn out to contain.
    if (resolved !== path.join(root, ownerId, filename)) continue;
    try {
      const file = await readFile(resolved);
      return new Response(new Uint8Array(file), {
        headers: {
          "Content-Type": contentType,
          // Private: the response is specific to this signed-in user, so no
          // shared cache may keep a copy for the next person.
          "Cache-Control": "private, max-age=31536000, immutable",
        },
      });
    } catch {
      // try the next root
    }
  }

  return new Response("Not found", { status: 404 });
}
