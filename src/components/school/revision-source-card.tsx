import Link from "next/link";
import { updateSubjectRevisionUrl } from "@/lib/school/actions";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

/**
 * The revision site you work from for this subject. The app keeps the link and
 * nothing else — it never fetches the page, so nothing of a paid site's
 * content is copied into this app, and the AI is told it hasn't read it.
 */
export function RevisionSourceCard({
  subjectId,
  subjectName,
  revisionUrl,
}: {
  subjectId: string;
  subjectName: string;
  revisionUrl: string | null;
}) {
  const host = (() => {
    if (!revisionUrl) return null;
    try {
      return new URL(revisionUrl).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  })();

  return (
    <div className="flex flex-col gap-3">
      {revisionUrl && host ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-muted p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{host}</p>
            <p className="truncate text-xs text-muted">{revisionUrl}</p>
          </div>
          <Link href={revisionUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="secondary">
              <ExternalLink size={14} />
              Open revision notes
            </Button>
          </Link>
        </div>
      ) : (
        <p className="text-sm text-muted">
          No revision site saved for {subjectName} yet — paste the page you actually revise from (Save My Exams,
          Physics &amp; Maths Tutor, your school&apos;s portal) and it&apos;s one tap away from here.
        </p>
      )}

      <form action={updateSubjectRevisionUrl.bind(null, subjectId)} className="flex flex-wrap gap-2">
        <input
          name="revisionUrl"
          type="url"
          defaultValue={revisionUrl ?? ""}
          placeholder="https://www.savemyexams.com/…"
          className="min-w-[14rem] flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button type="submit" size="sm" variant="outline">
          {revisionUrl ? "Update link" : "Save link"}
        </Button>
      </form>

      <p className="text-xs text-muted">
        Saving the link tells the tutor and quiz which material you&apos;re revising from, so explanations are
        structured the same way. It does <strong>not</strong> give the AI that site&apos;s content — the app never
        fetches the page, and the AI is explicitly told it hasn&apos;t read it, so it can&apos;t quote or invent what a
        page says. To work from a specific page, photograph it under a topic and the AI reads your photo.
      </p>
    </div>
  );
}
