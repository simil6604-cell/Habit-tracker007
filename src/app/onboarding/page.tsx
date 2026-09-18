import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { RestoreBackupPanel } from "@/components/settings/restore-backup-panel";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingComplete: true },
  });
  if (user?.onboardingComplete) redirect("/");

  return (
    <>
      <OnboardingWizard />
      {/*
        The restore lives here as well as in Settings, because this is the
        screen a new install lands on and every other page sends you back to
        it. Setting the app up by hand first, only to replace all of it with a
        backup, is the wrong order for the one case a backup is for.
      */}
      <div className="mx-auto mb-16 w-full max-w-md px-4">
        <details className="rounded-xl border border-border bg-surface p-4">
          <summary className="cursor-pointer text-sm font-medium">Already have a backup?</summary>
          <p className="mb-3 mt-2 text-xs text-muted">
            Restore it instead of setting everything up again. Your subjects, workouts, matches and photos come back
            as they were, and you can skip the rest of this.
          </p>
          <RestoreBackupPanel />
        </details>
      </div>
    </>
  );
}
