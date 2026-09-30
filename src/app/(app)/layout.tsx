import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { countLibrary } from "@/lib/library/library-data";
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

  const libraryCount = await countLibrary(session.user.id);

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar libraryCount={libraryCount} />
      {/* min-w-0 / overflow-x-clip: a flex item defaults to min-width:auto, so any
          wide child (a league table, a timetable grid) stretched the whole shell and
          the page scrolled sideways on a phone. Wide content scrolls in its own box.

          CLIP, not hidden. They look identical and behave differently: hidden makes
          this a scroll container, which quietly breaks everything inside that depends
          on the page being the scroller — position:sticky stops sticking, and an
          anchor link scrolls this box instead of the page, so tapping it does nothing
          you can see. Both were found by tapping the new jump bar and watching it not
          move. */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-clip">
        <AIStatusBanner />
        <main className="min-w-0 flex-1 pb-24 lg:pb-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
