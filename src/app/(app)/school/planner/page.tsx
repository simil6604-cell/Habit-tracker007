import { auth } from "@/lib/auth/auth";
import { generateDayPlan } from "@/lib/ai/schedule-generator";
import { PlanDayCard } from "@/components/school/plan-day-card";

export default async function StudyPlannerPage() {
  const session = await auth();
  const userId = session!.user.id;

  const days = [1, 2, 3].map((offset) => new Date(Date.now() + offset * 86400000));
  const plans = await Promise.all(days.map((d) => generateDayPlan(userId, d)));

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight">Study Planner</h1>
      <p className="mt-1 text-muted">
        Built from your real exams, topic progress and existing schedule — not generic advice.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {days.map((d, i) => (
          <PlanDayCard key={d.toISOString()} date={d} plan={plans[i]} />
        ))}
      </div>
    </div>
  );
}
