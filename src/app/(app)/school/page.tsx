import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { createSubject } from "@/lib/school/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TimetableDiagram } from "@/components/school/timetable-diagram";
import { SubjectCard } from "@/components/school/subject-card";
import { SchoolHero } from "@/components/school/school-hero";
import { SectionJump, type JumpSection } from "@/components/school/section-jump";
import { getSchoolHeroData } from "@/lib/school/hero";
import { SchoolAISection } from "@/components/school/school-ai-section";
import { getSchoolAISectionData } from "@/lib/school/school-ai-section";
import { InsightsPanel } from "@/components/school/insights-panel";
import { getSchoolInsights } from "@/lib/school/insights-data";
import { RevisionLinksPanel } from "@/components/school/revision-links-panel";
import { SubjectLinksGrid } from "@/components/school/subject-links-grid";
import { subjectSetup } from "@/lib/school/revision-setup";
import { ProgressPlanPanel } from "@/components/progress/progress-plan";
import { getSchoolProgress } from "@/lib/progress/school-plan";
import { parseMilestoneTab } from "@/lib/progress/milestones";
import { HomeworkPanel, ExamPanel } from "@/components/school/homework-exam-lists";
import { DailyChecklist } from "@/components/school/daily-checklist";
import { getTodaySchoolChecklist } from "@/lib/planner/day-review";
import { DomainTasksPanel } from "@/components/tasks/domain-tasks-panel";
import { NotesOverviewPanel } from "@/components/school/notes-overview-panel";
import { getSchoolNotesOverview } from "@/lib/school/notes-overview";
import { WeekView } from "@/components/calendar/week-view";
import { getCalendarItems } from "@/lib/calendar/items";
import { SubjectProgressChart } from "@/components/charts/subject-progress-chart";
import { getAnalyticsData } from "@/lib/analytics/data";
import { addDays, startOfDay } from "date-fns";

/**
 * The chips in the jump bar, in the order they are wanted rather than the
 * order they appear: the tutor and today are what you open the page for.
 * Every id here must exist on the page — an e2e test checks exactly that.
 */
const SCHOOL_SECTIONS: readonly JumpSection[] = [
  { id: "tutor", label: "Tutor" },
  { id: "today", label: "Today" },
  { id: "progress", label: "Progress" },
  { id: "revision-sources", label: "Links" },
  { id: "timetable", label: "Timetable" },
  { id: "subjects", label: "Subjects" },
  { id: "homework", label: "Homework" },
  { id: "notes", label: "Notes" },
];

export default async function SchoolPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  const userId = session!.user.id;
  const now = new Date();

  // School's OWN progress plan — Gym and Football each build their own.
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const milestoneTab = parseMilestoneTab(one("mtab"));
  const milestoneQuery = (one("mq") ?? "").slice(0, 60);
  const schoolProgress = await getSchoolProgress(userId, now);
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [subjects, slots, homework, exams, checklist] = await Promise.all([
    prisma.subject.findMany({ where: { userId }, include: { topics: true }, orderBy: { createdAt: "asc" } }),
    prisma.timetableSlot.findMany({ where: { userId }, include: { subject: true } }),
    prisma.homework.findMany({ where: { userId, status: "PENDING" }, include: { subject: true }, orderBy: { dueDate: "asc" }, take: 20 }),
    prisma.exam.findMany({ where: { userId, date: { gte: now, lte: in14 } }, include: { subject: true }, orderBy: { date: "asc" } }),
    getTodaySchoolChecklist(userId),
  ]);

  const heroData = await getSchoolHeroData(userId, checklist, now);

  const [schoolTasks, notes, aiSection, insights, revisionLinks] = await Promise.all([
    prisma.task.findMany({
      where: { userId, category: "SCHOOL" },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 20,
    }),
    getSchoolNotesOverview(userId),
    getSchoolAISectionData(userId),
    getSchoolInsights(userId, now),
    prisma.revisionLink.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, url: true, kind: true, subjectId: true, topicId: true },
    }),
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
      <SchoolHero data={heroData} />

      {/*
        This page is long on purpose — everything about school lives here — so
        it gets a way in that is not scrolling. Nothing moves; each chip is an
        anchor to a section that was already there.
      */}
      <SectionJump sections={SCHOOL_SECTIONS} className="sticky top-0 z-30 mt-3 border-b border-border/60 bg-background/85 backdrop-blur" />

      <InsightsPanel insights={insights} />

      <div id="progress" className="mt-4 scroll-mt-20">
        <ProgressPlanPanel
          plan={schoolProgress}
          title="School progress"
          tab={milestoneTab}
          query={milestoneQuery}
          basePath="/school"
        />
      </div>

      <Card id="revision-sources" className="mt-4 scroll-mt-20" data-testid="revision-sources">
        <CardHeader>
          <CardTitle>Where you revise from</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/*
            Two slots per subject, so a missing one is visible rather than
            something you find out about when you need it.
          */}
          <SubjectLinksGrid setup={subjectSetup(subjectCards.map((s) => ({ id: s.id, name: s.name })), revisionLinks)} />

          <RevisionLinksPanel
            links={revisionLinks}
            subjects={subjects.map((s) => ({
              id: s.id,
              name: s.name,
              topics: s.topics.map((t) => ({ id: t.id, name: t.name })),
            }))}
          />
        </CardContent>
      </Card>

      <div id="tutor" className="scroll-mt-16">
        <SchoolAISection data={aiSection} />
      </div>

      <Card id="today" className="mt-4 scroll-mt-16">
        <CardHeader>
          <CardTitle>Today</CardTitle>
        </CardHeader>
        <CardContent>
          <DailyChecklist checklist={checklist} />
        </CardContent>
      </Card>

      <Card id="timetable" className="mt-4 scroll-mt-16">
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

      <Card id="subjects" className="mt-4 scroll-mt-16">
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="subject-cards">
              {subjectCards.map((s) => (
                <SubjectCard key={s.id} subject={s} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div id="homework" className="mt-4 grid gap-4 scroll-mt-16 lg:grid-cols-2">
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

      <div id="notes" className="mt-4 grid gap-4 scroll-mt-16 lg:grid-cols-2">
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
