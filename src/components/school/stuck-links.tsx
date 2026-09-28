import Link from "next/link";
import { BookOpen, Layers } from "lucide-react";
import { detectProvider, stuckLinks, type LinkScope, type StoredLink } from "@/lib/school/revision-links";

/**
 * The two ways out when you are stuck: somewhere to read it up, and somewhere
 * to test yourself.
 *
 * Rendered by the app from the stored URL, not written into the AI's answer.
 * A link is either exactly right or it is useless, and a model asked to
 * reproduce a deck UUID will eventually get one character wrong — at which
 * point you tap a dead link and think your own deck is broken.
 *
 * Shown wherever being stuck actually happens: under the chat, and on a
 * subject's own page. A link is picked most-specific-first, so a topic link
 * beats a subject link beats one saved for no subject at all.
 */
export function StuckLinks({
  links,
  scope,
  anySubject,
  className,
}: {
  links: StoredLink[];
  scope?: LinkScope;
  /**
   * For a place with no subject in view — the tutor chat. Without it, a
   * student who files every link under its subject is told to save the pages
   * they have already saved.
   */
  anySubject?: boolean;
  className?: string;
}) {
  const { lookUp, testYourself } = stuckLinks(links, scope ?? {}, { anySubject });

  if (!lookUp && !testYourself) {
    return (
      <p className={`text-xs text-muted ${className ?? ""}`} data-testid="stuck-links-empty">
        Save the page you read from and the deck you test yourself on under{" "}
        <Link href="/school#revision-sources" className="underline">
          Where you revise from
        </Link>{" "}
        and they will sit here, one tap away, whenever you are stuck.
      </p>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`} data-testid="stuck-links">
      <span className="text-xs text-muted">Still not sure?</span>

      {lookUp && (
        <a
          href={lookUp.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="stuck-look-up"
          className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-accent"
        >
          <BookOpen size={13} className="text-muted" />
          Look it up
          <span className="font-normal text-muted">
            {detectProvider(lookUp.url) ?? lookUp.title}
            {lookUp.subjectName ? ` · ${lookUp.subjectName}` : ""}
          </span>
        </a>
      )}

      {testYourself && (
        <a
          href={testYourself.url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="stuck-test-yourself"
          className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-accent"
        >
          <Layers size={13} className="text-muted" />
          Test yourself
          <span className="font-normal text-muted">
            {testYourself.title}
            {testYourself.subjectName ? ` · ${testYourself.subjectName}` : ""}
          </span>
        </a>
      )}
    </div>
  );
}
