import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { CATEGORY_LABELS } from "@/lib/assessment/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default async function AssessmentHubPage() {
  const session = await auth();
  const userId = session!.user.id;

  const categories = ["SCHOOL", "GYM", "FOOTBALL"] as const;
  const latestByCategory = await Promise.all(
    categories.map((c) =>
      prisma.assessment.findFirst({ where: { userId, category: c }, orderBy: { createdAt: "desc" } })
    )
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Where do you stand?</h1>
      <p className="mt-1 text-muted">
        A quick honest baseline for each area — the AI Coach uses it until it has enough real activity data of its own.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {categories.map((c, i) => {
          const meta = CATEGORY_LABELS[c];
          const latest = latestByCategory[i];
          return (
            <Card key={c}>
              <CardHeader>
                <CardTitle>{meta.emoji} {meta.title}</CardTitle>
                <Link href={`/assessment/${c.toLowerCase()}`}>
                  <Button size="sm" variant={latest ? "outline" : "primary"}>
                    {latest ? "Retake" : "Take assessment"}
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {latest ? (
                  <div className="flex flex-col gap-2">
                    <ProgressBar value={latest.overallScore} />
                    <p className="text-xs text-muted">
                      {latest.overallScore}% baseline · taken {format(latest.createdAt, "MMM d, yyyy")}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Not taken yet.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
