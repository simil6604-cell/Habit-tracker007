"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { parseLink } from "./links";
import { schemaErrorMessage } from "@/lib/config/schema-check";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

function revalidateFootball() {
  revalidatePath("/football");
  revalidatePath("/football/team");
}

export type SaveLinkState = { ok: boolean; error?: string } | null;

/**
 * Saves a league page so it is one tap away.
 *
 * Nothing is fetched. The page is opened by your browser when you press the
 * button, which is why this works for the sites the importer cannot read.
 */
export async function addFootballLink(_prev: SaveLinkState, formData: FormData): Promise<SaveLinkState> {
  const userId = await requireUserId();

  const parsed = parseLink(formData.get("url"), formData.get("title"), formData.get("kind"));
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    await prisma.footballLink.create({
      data: { userId, kind: parsed.kind, title: parsed.title, url: parsed.url },
    });
  } catch (error) {
    // A deployment whose database was never brought up to date has no table to
    // write to. Thrown, that reaches the screen as a blank failure and reads as
    // a bug in this panel; said out loud, it names the real problem.
    const schema = schemaErrorMessage(error);
    if (schema) return { ok: false, error: schema };
    throw error;
  }

  revalidateFootball();
  return { ok: true };
}

export async function deleteFootballLink(formData: FormData): Promise<void> {
  const userId = await requireUserId();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // Scoped to the owner in the same query: an id from somewhere else matches
  // nothing rather than deleting somebody's link.
  await prisma.footballLink.deleteMany({ where: { id, userId } });

  revalidateFootball();
}
