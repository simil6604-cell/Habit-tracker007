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

  const subjectCards = subjects.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color,
    teacher: s.teacher,
    room: s.room,
    isExamSubject: s.isExamSubject,
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
            <Link href="/school/habits"><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Habit tracker</Button></Link>
            <Link href="/school/planner"><Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20">Study planner</Button></Link>
            <Link href="/school/flashcards"><Button className="bg-white text-indigo-700 hover:opacity-90">Flashcards</Button></Link>
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
    </div>
  );
}
