"use client";

import { useTransition } from "react";
import { levelsForSystems } from "@/lib/data/cambridge";
import { updateSubjectLevel } from "@/lib/school/actions";

export function SubjectLevelPicker({
  subjectId,
  level,
  systems,
}: {
  subjectId: string;
  level: string | null;
  systems: string[];
}) {
  const [pending, startTransition] = useTransition();
  const levels = levelsForSystems(systems);

  return (
    <select
      value={level ?? ""}
      disabled={pending}
      onChange={(e) => startTransition(() => updateSubjectLevel(subjectId, e.target.value))}
      title="What level is this subject sat at? The AI pitches its answers to this."
      className="rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs"
    >
      <option value="">Set level…</option>
      {levels.map((l) => (
        <option key={l.value} value={l.value}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
