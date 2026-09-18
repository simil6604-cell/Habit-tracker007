import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { slotsToGridRows } from "@/lib/school/timetable-grid";
import { TimetableEditor } from "@/components/school/timetable-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default async function TimetableEditorPage() {
  const session = await auth();
  const userId = session!.user.id;

  const [slots, subjects] = await Promise.all([
    prisma.timetableSlot.findMany({ where: { userId }, include: { subject: true } }),
    prisma.subject.findMany({ where: { userId }, orderBy: { name: "asc" } }),
  ]);

  const rows = slotsToGridRows(slots);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/school" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Back to School
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Edit your timetable</h1>
      <p className="mt-1 text-muted">
        Define each period once (name, time, type), then fill in Monday–Friday. Matches a real school day —
        registration, lessons, breaks, study periods and clubs all fit.
      </p>

      <Card className="mt-6">
        <CardHeader><CardTitle>Weekly grid</CardTitle></CardHeader>
        <CardContent>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted">
              Add at least one subject on the <Link href="/school" className="text-accent">School page</Link> first,
              then come back here to place it into your timetable.
            </p>
          ) : (
            <TimetableEditor initialRows={rows} subjects={subjects} />
          )}
        </CardContent>
      </Card>

      <div className="mt-4">
        <Link href="/school"><Button variant="secondary">Done</Button></Link>
      </div>
    </div>
  );
}
