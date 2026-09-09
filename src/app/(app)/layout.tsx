import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { computeDomainScores } from "@/lib/planner/scores";
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
      <div className="flex min-h-screen flex-1 flex-col">
        <main className="flex-1 pb-24 lg:pb-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
