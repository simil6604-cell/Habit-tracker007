import Link from "next/link";
import { BookOpen, Layers, Plus } from "lucide-react";
import { detectProvider } from "@/lib/school/revision-links";
import type { SubjectSetup } from "@/lib/school/revision-setup";

/**
 * Two slots per subject: somewhere to look it up, somewhere to test yourself.
 *
 * The app cannot fill either. It has never opened Save My Exams or Carousel —
 * they are blocked from this environment and they are somebody else's product
 * — so it does not know the address of your Biology page. Guessing one would
 * give you a link that 404s, and that is worse than an empty slot: you tap it
 * and conclude your own account is broken.
 *
 * So an empty slot says so, and filling it is one paste. What the app CAN do
 * is know exactly which slot is empty and put that where you will see it.
 */
export function SubjectLinksGrid({ setup }: { setup: SubjectSetup[] }) {
  if (setup.length === 0) {
    return <p className="text-sm text-muted">Add a subject first and its two slots appear here.</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2" data-testid="subject-links-grid">
      {setup.map((subject) => (
        <div
          key={subject.id}
          data-testid={`subject-links-${subject.id}`}
          className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface p-3.5"
        >
          <Link href={`/school/subjects/${subject.id}`} className="text-sm font-medium hover:underline">
            {subject.name}
          </Link>

          <div className="flex flex-col gap-1.5">
            <Slot
              icon={<BookOpen size={13} />}
              label="Look it up"
              href={subject.lookUp?.url}
              detail={subject.lookUp ? (detectProvider(subject.lookUp.url) ?? subject.lookUp.title) : null}
              missingHint="Save My Exams, or wherever you read"
            />
            <Slot
              icon={<Layers size={13} />}
              label="Test yourself"
              href={subject.deck?.url}
              detail={subject.deck?.title ?? null}
              missingHint="a Carousel Learning deck"
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Slot({
  icon,
  label,
  href,
  detail,
  missingHint,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string;
  detail: string | null;
  missingHint: string;
}) {
  // Wrapping, not truncating: on a phone the hint is the whole instruction
  // ("paste a Carousel Learning deck"), and half of it says nothing.
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-2 rounded-lg bg-surface-muted px-2.5 py-1.5 text-xs transition hover:text-accent"
      >
        <span className="mt-0.5 shrink-0 text-muted">{icon}</span>
        <span className="min-w-0 break-words">
          <span className="font-medium">{label}</span> <span className="text-muted">{detail}</span>
        </span>
      </a>
    );
  }

  return (
    <span className="flex items-start gap-2 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-xs text-muted">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <Plus size={11} className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">
        {label} — paste {missingHint}
      </span>
    </span>
  );
}
