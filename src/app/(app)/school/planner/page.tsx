import { addDays, format, startOfDay } from "date-fns";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { generateDayPlan } from "@/lib/ai/schedule-generator";
import { PlanDayCard } from "@/components/school/plan-day-card";
import { AddStudyBlockForm } from "@/components/school/add-study-block-form";
import { OwnStudyBlocks, type OwnBlock } from "@/components/school/own-study-blocks";
import { PLANNER_DAYS } from "@/lib/school/planner-entry";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Study Planner" };

export default async function StudyPlannerPage() {
  const session = await auth();
  const userId = session!.user.id;

  const today = startOfDay(new Date());
  const days = Array.from({ length: PLANNER_DAYS }, (_, i) => addDays(today, i));
  const rangeEnd = addDays(days[days.length - 1], 1);

  const [subjects, sessions] = await Promise.all([
    prisma.subject.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.studySession.findMany({
      where: { userId, start: { gte: today, lt: rangeEnd } },
      include: { subject: { select: { name: true } } },
      orderBy: { start: "asc" },
    }),
  ]);

  // Only the first three days get a generated suggestion. Each one is a real
  // query over exams, topics and that day's commitments, and running seven of
  // them to fill a page nobody scrolls that far down is work for nothing.
  const SUGGESTED_DAYS = 3;
  const plans = await Promise.all(days.slice(0, SUGGESTED_DAYS).map((d) => generateDayPlan(userId, d)));

  const byDay = new Map<string, OwnBlock[]>();
  for (const s of sessions) {
    const key = format(s.start, "yyyy-MM-dd");
    const list = byDay.get(key) ?? [];
    list.push({
      id: s.id,
      title: s.topicLabel ?? s.subject?.name ?? "Study",
      subjectName: s.subject?.name ?? null,
      start: s.start,
      end: s.end,
      completed: s.completed,
      aiGenerated: s.aiGenerated,
    });
    byDay.set(key, list);
  }

  const dayOptions = days.map((d, i) => ({
    value: format(d, "yyyy-MM-dd"),
    label: i === 0 ? `Today, ${format(d, "EEE d MMM")}` : format(d, "EEEE d MMM"),
  }));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Study Planner</h1>
      <p className="mt-1 text-muted">
        Write your own blocks, and see what the app would suggest from your real exams and topic progress.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Write your own block</CardTitle>
        </CardHeader>
        <CardContent>
          <AddStudyBlockForm days={dayOptions} subjects={subjects} />
          <p className="mt-2 text-xs text-muted">
            Yours to write — anything, in your own words. Leave the time blank and it is simply something to do that
            day; give it a time and a length and it becomes a block in your calendar that counts towards your logged
            study time once you tick it off.
          </p>
        </CardContent>
      </Card>

      <div className="mt-4 flex flex-col gap-4">
        {days.map((day, i) => {
          const key = format(day, "yyyy-MM-dd");
          const own = byDay.get(key) ?? [];
          const plan = plans[i];

          return (
            <Card key={key} data-testid={`planner-day-${key}`}>
              <CardHeader>
                <CardTitle>{i === 0 ? `Today — ${format(day, "EEEE d MMM")}` : format(day, "EEEE d MMM")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <OwnStudyBlocks blocks={own} />
                {plan && <PlanDayCard date={day} plan={plan} />}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
