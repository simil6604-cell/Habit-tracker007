"use server";

import { auth } from "@/lib/auth/auth";
import { getWeeklyTimeSplit } from "./data";

export async function fetchWeeklyTimeSplit(weekOffset: number) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return getWeeklyTimeSplit(session.user.id, Math.max(0, weekOffset));
}
