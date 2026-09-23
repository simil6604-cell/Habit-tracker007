import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { createSubject } from "@/lib/school/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TimetableDiagram } from "@/components/school/timetable-diagram";
import { SubjectCard } from "@/components/school/subject-card";
import { HomeworkPanel, ExamPanel } from "@/components/school/homework-exam-lists";
import { DailyChecklist } from "@/components/school/daily-checklist";
import { getTodaySchoolChecklist } from "@/lib/planner/day-review";
import { DomainHero } from "@/components/layout/domain-hero";
import { DomainTasksPanel } from "@/components/tasks/domain-tasks-panel";
import { NotesOverviewPanel } from "@/components/school/notes-overview-panel";
import { getSchoolNotesOverview } from "@/lib/school/notes-overview";
import { WeekView } from "@/components/calendar/week-view";
import { getCalendarItems } from "@/lib/calendar/items";
import { SubjectProgressChart } from "@/components/charts/subject-progress-chart";
import { getAnalyticsData } from "@/lib/analytics/data";
import { addDays, startOfDay } from "date-fns";

export default async function SchoolPage() {
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [subjects, slots, homework, exams, checklist] = await Promise.all([
    prisma.subject.findMany({ where: { userId }, include: { topics: true }, orderBy: { createdAt: "asc" } }),
    prisma.timetableSlot.findMany({ where: { userId }, include: { subject: true } }),
    prisma.homework.findMany({ where: { userId, status: "PENDING" }, include: { subject: true }, orderBy: { dueDate: "asc" }, take: 20 }),
    prisma.exam.findMany({ where: { userId, date: { gte: now, lte: in14 } }, include: { subject: true }, orderBy: { date: "asc" } }),
    getTodaySchoolChecklist(userId),
  ]);

  const [schoolTasks, notes] = await Promise.all([
    prisma.task.findMany({
      where: { userId, category: "SCHOOL" },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 20,
    }),
    getSchoolNotesOverview(userId),
  ]);

  // Next seven days, narrowed to what actually belongs to school.
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfDay(now), i));
  const [weekItems, analytics] = await Promise.all([
    getCalendarItems(userId, weekDays[0], addDays(weekDays[6], 1)),
    getAnalyticsData(userId),
  ]);
  const schoolWeekItems = weekItems.filter((i) => ["SCHOOL", "STUDY", "EXAM"].includes(i.category));

  const subjectCards = subjects.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    teacher: s.teacher,
    room: s.room,
    isExamSubject: s.isExamSubject,
    level: s.level,
    topicCount: s.topics.length,
    avgProgress: s.topics.length ? Math.round(s.topics.reduce((a, t) => a + t.progressPct, 0) / s.topics.length) : 0,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <DomainHero
        domain="school"
        emoji="🎓"
        title="School"
        subtitle="Timetable, subjects, homework and exams — all in one place."
        actions={
          <>
            <Link href="/school/ai"><Button className="bg-white text-indigo-700 hover:opacity-90">🎓 School AI</Button></Link>
            <Link href="/school/habits"><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Habit tracker</Button></Link>
            <Link href="/school/planner"><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Study planner</Button></Link>
            <Link href="/school/flashcards"><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Flashcards</Button></Link>
          </>
        }
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Today</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyChecklist checklist={checklist} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Timetable</CardTitle>
          <Link href="/school/timetable"><Button variant="outline" size="sm">Edit timetable</Button></Link>
        </CardHeader>
        <CardContent>
          <TimetableDiagram slots={slots} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>This school week</CardTitle>
          <Link href="/calendar"><Button variant="outline" size="sm">Full calendar</Button></Link>
        </CardHeader>
        <CardContent>
          {schoolWeekItems.length === 0 ? (
            <p className="text-sm text-muted">
              Nothing school-related scheduled in the next 7 days — add homework, an exam or a school task and it
              shows up here.
            </p>
          ) : (
            <WeekView days={weekDays} items={schoolWeekItems} />
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Subjects</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action={createSubject} className="flex flex-wrap items-center gap-2">
            <input name="name" required placeholder="Subject name" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input name="teacher" placeholder="Teacher (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <input name="room" placeholder="Room (optional)" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" />
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" name="isExamSubject" /> Exam subject (e.g. IGCSE)
            </label>
            <Button type="submit" size="sm" variant="secondary">Add subject</Button>
          </form>

          {subjectCards.length === 0 ? (
            <p className="text-sm text-muted">No subjects yet — add your first one above.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {subjectCards.map((s) => (
                <SubjectCard key={s.id} subject={s} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Homework</CardTitle>
          </CardHeader>
          <CardContent>
            <HomeworkPanel homework={homework} subjects={subjects.map((s) => ({ id: s.id, name: s.name }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Exams</CardTitle>
          </CardHeader>
          <CardContent>
            <ExamPanel exams={exams} subjects={subjects.map((s) => ({ id: s.id, name: s.name }))} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>School tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <DomainTasksPanel category="SCHOOL" tasks={schoolTasks} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>School analytics</CardTitle>
            <Link href="/analytics"><Button variant="outline" size="sm">Full analytics</Button></Link>
          </CardHeader>
          <CardContent>
            {analytics.subjectProgress.length === 0 ? (
              <p className="text-sm text-muted">Add subjects and topics to see progress here.</p>
            ) : (
              <SubjectProgressChart data={analytics.subjectProgress} />
            )}
            <div className="mt-3 flex justify-between text-sm text-muted">
              <span>{Math.round(analytics.totalStudyMinutes / 60)}h logged study time</span>
              <span>{analytics.homeworkRate}% homework completion</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>My notes &amp; recordings</CardTitle>
            <Link href="/school/flashcards">
              <Button variant="outline" size="sm">
                Flashcards
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <NotesOverviewPanel entries={notes} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
