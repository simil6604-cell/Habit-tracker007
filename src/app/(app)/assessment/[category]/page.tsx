import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { AssessmentForm, type Question } from "@/components/assessment/assessment-form";
import { GYM_QUESTIONS, FOOTBALL_QUESTIONS, SCHOOL_GENERAL_QUESTIONS, CATEGORY_LABELS } from "@/lib/assessment/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";

const VALID = ["school", "gym", "football"] as const;

export default async function AssessmentCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: raw } = await params;
  if (!VALID.includes(raw as (typeof VALID)[number])) notFound();
  const category = raw.toUpperCase() as "SCHOOL" | "GYM" | "FOOTBALL";

  const session = await auth();
  const userId = session!.user.id;

  let questions: Question[];
  if (category === "SCHOOL") {
    const subjects = await prisma.subject.findMany({ where: { userId }, orderBy: { name: "asc" } });
    questions = [
      ...subjects.map((s) => ({ id: `subj-${s.id}`, label: `How confident do you feel in ${s.name}?`, subjectId: s.id })),
      ...SCHOOL_GENERAL_QUESTIONS,
    ];
  } else if (category === "GYM") {
    questions = GYM_QUESTIONS;
  } else {
    questions = FOOTBALL_QUESTIONS;
  }

  const meta = CATEGORY_LABELS[category];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/assessment" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft size={14} /> Back
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{meta.emoji} {meta.title} baseline</h1>
      <p className="mt-1 text-muted">
        Quick self-rating — honest answers help the AI Coach build a realistic plan from day one, not guess.
      </p>

      <Card className="mt-6">
        <CardHeader><CardTitle>Where do you stand right now?</CardTitle></CardHeader>
        <CardContent>
          <AssessmentForm category={category} questions={questions} />
        </CardContent>
      </Card>
    </div>
  );
}
