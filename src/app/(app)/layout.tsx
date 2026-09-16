import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { computeDomainScores } from "@/lib/planner/scores";
import { AIStatusBanner } from "@/components/layout/ai-status-banner";
import { Sidebar } from "@/components/layout/sidebar";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingComplete: true },
  });

  if (!user) redirect("/login");
  if (!user.onboardingComplete) redirect("/onboarding");

  const scores = await computeDomainScores(session.user.id);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar overallScore={scores.overall} />
      {/* min-w-0 / overflow-x-hidden: a flex item defaults to min-width:auto, so any
          wide child (a league table, a timetable grid) stretched the whole shell and
          the page scrolled sideways on a phone. Wide content scrolls in its own box. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden">
        <AIStatusBanner />
        <main className="min-w-0 flex-1 pb-24 lg:pb-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
