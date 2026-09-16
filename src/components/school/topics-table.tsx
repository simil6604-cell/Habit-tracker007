"use client";

import { Fragment, useState, useTransition } from "react";
import { AIProse } from "@/components/shared/ai-message";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateTopicProgress, deleteTopic, updateTopicRevisionUrl } from "@/lib/school/actions";
import { revisionHost } from "@/lib/utils/revision-url";
import { submitMistake } from "@/lib/school/learning-actions";
import { TutorChatPanel } from "@/components/school/tutor-chat-panel";
import { LearningLogAndQuiz } from "@/components/school/learning-log-quiz";
import { NotePhotoPanel } from "@/components/school/note-photo-panel";
import { ClassRecorderPanel } from "@/components/school/class-recorder-panel";
import { Trash2, Sparkles } from "lucide-react";
import { format } from "date-fns";

type Topic = {
  id: string;
  name: string;
  progressPct: number;
  priority: string;
  examRelevance: string;
  plannedMinutes: number;
  actualMinutes: number;
  nextReview: Date | null;
  weaknessNote: string | null;
  revisionUrl: string | null;
};

function statusEmoji(pct: number) {
  if (pct >= 80) return "✅";
  if (pct >= 50) return "🟡";
  return "🔴";
}

/**
 * The revision page for this topic, falling back to the subject's.
 *
 * Which one you're looking at is labelled: "the subject's page" and "this
 * topic's page" send you to different places, and silently opening the wrong
 * one is worse than saying which it is.
 */
function RevisionLink({
  topicId,
  subjectId,
  topicUrl,
  subjectUrl,
}: {
  topicId: string;
  subjectId: string;
  topicUrl: string | null;
  subjectUrl: string | null;
}) {
  const effective = topicUrl ?? subjectUrl;
  const host = revisionHost(effective);

  return (
    <div className="flex flex-col gap-1.5">
      {effective && host && (
        <a href={effective} target="_blank" rel="noopener noreferrer" className="self-start text-xs text-accent hover:underline">
          ↗ Open {topicUrl ? "this topic's" : "the subject's"} revision notes on {host}
        </a>
      )}
      <form action={updateTopicRevisionUrl.bind(null, topicId, subjectId)} className="flex flex-wrap items-center gap-1.5">
        <input
          name="revisionUrl"
          type="url"
          defaultValue={topicUrl ?? ""}
          placeholder={subjectUrl ? "Link for this topic specifically…" : "Paste the revision page for this topic…"}
          className="min-w-[12rem] flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
        />
        <button type="submit" className="text-xs text-accent hover:underline">
          {topicUrl ? "Update" : "Save"}
        </button>
      </form>
    </div>
  );
}

function TopicAssistant({
  topicId,
  subjectId,
  topicUrl,
  subjectUrl,
}: {
  topicId: string;
  subjectId: string;
  topicUrl: string | null;
  subjectUrl: string | null;
}) {
  const [response, setResponse] = useState<string | null>(null);
  const [mistake, setMistake] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-muted p-4">
      {/* The revision page, right where the questions get asked — the
          assistant can't read it, so getting there in one tap is what helps. */}
      <RevisionLink topicId={topicId} subjectId={subjectId} topicUrl={topicUrl} subjectUrl={subjectUrl} />
      <TutorChatPanel topicId={topicId} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <input
          value={mistake}
          onChange={(e) => setMistake(e.target.value)}
          placeholder="What did you get wrong? e.g. &quot;mixed up two formulas&quot;"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <Button
          size="sm"
          disabled={pending || !mistake.trim()}
          onClick={() =>
            startTransition(async () => {
              const res = await submitMistake(topicId, mistake);
              setResponse(res);
              setMistake("");
            })
          }
        >
          Log mistake
        </Button>
      </div>

      {pending && <p className="text-xs text-muted">Thinking…</p>}
      {response && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <AIProse text={response} />
        </div>
      )}

      <LearningLogAndQuiz topicId={topicId} />

      <div className="border-t border-border pt-3">
        <NotePhotoPanel topicId={topicId} />
      </div>

      <div className="border-t border-border pt-3">
        <ClassRecorderPanel topicId={topicId} />
      </div>
    </div>
  );
}

export function TopicsTable({
  subjectId,
  topics,
  revisionUrl = null,
}: {
  subjectId: string;
  topics: Topic[];
  revisionUrl?: string | null;
}) {
  const [, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="py-2 pr-3">Topic</th>
            <th className="py-2 pr-3">Progress</th>
            <th className="py-2 pr-3">Priority</th>
            <th className="py-2 pr-3">Exam relevance</th>
            <th className="py-2 pr-3">Time (planned/actual)</th>
            <th className="py-2 pr-3">Next review</th>
            <th className="py-2 pr-3">Weakness</th>
            <th className="py-2" />
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => (
            <Fragment key={t.id}>
              <tr className="border-b border-border/60 align-middle">
                <td className="py-2.5 pr-3 font-medium">
                  {statusEmoji(t.progressPct)} {t.name}
                </td>
                <td className="w-40 py-2.5 pr-3">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={t.progressPct} className="w-24" colorClassName="bg-cat-school" />
                    <input
                      type="range"
                      min={0}
                      max={100}
                      defaultValue={t.progressPct}
                      className="w-16 accent-[var(--accent)]"
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        startTransition(() => updateTopicProgress(t.id, subjectId, v));
                      }}
                    />
                  </div>
                </td>
                <td className="py-2.5 pr-3">
                  <Badge variant={t.priority === "HIGH" ? "danger" : t.priority === "LOW" ? "default" : "warning"}>{t.priority}</Badge>
                </td>
                <td className="py-2.5 pr-3">
                  <Badge variant={t.examRelevance === "HIGH" ? "danger" : "default"}>{t.examRelevance}</Badge>
                </td>
                <td className="py-2.5 pr-3 text-xs text-muted">
                  {t.plannedMinutes}m / {t.actualMinutes}m
                </td>
                <td className="py-2.5 pr-3 text-xs text-muted">{t.nextReview ? format(t.nextReview, "MMM d") : "—"}</td>
                <td className="py-2.5 pr-3 text-xs text-muted">{t.weaknessNote ?? "—"}</td>
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                      className={expanded === t.id ? "text-accent" : "text-muted hover:text-accent"}
                      title="AI Learning Assistant"
                    >
                      <Sparkles size={14} />
                    </button>
                    <form action={deleteTopic.bind(null, t.id, subjectId)}>
                      <button type="submit" className="text-muted hover:text-danger">
                        <Trash2 size={14} />
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
              {expanded === t.id && (
                <tr>
                  <td colSpan={8} className="pb-3">
                    <TopicAssistant topicId={t.id} subjectId={subjectId} topicUrl={t.revisionUrl} subjectUrl={revisionUrl} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {topics.length === 0 && (
            <tr>
              <td colSpan={8} className="py-4 text-center text-sm text-muted">
                No topics yet — add your syllabus topics below to track progress.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
