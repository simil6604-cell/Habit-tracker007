"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronUp, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { setPlanCheck, type PlanCheckState } from "@/lib/plan/plan-actions";
import {
  DOMAIN_META,
  KIND_META,
  MAX_PLAN_NOTE,
  MAX_PLAN_TIME,
  dayKey,
  type PlanItem,
  type PlanState,
} from "@/lib/plan/plan";

/**
 * One thing to do, with everything about it, and the two answers.
 *
 * "Done" is one tap. "Didn't manage it" opens a box, because that is the one
 * that is worth a sentence: a thing that did not happen and no record of why
 * is indistinguishable from a thing you forgot existed, and by Sunday you
 * cannot tell them apart either.
 */
export function PlanItemRow({ item, state }: { item: PlanItem; state: PlanState }) {
  const [result, submit, pending] = useActionState<PlanCheckState, FormData>(setPlanCheck, undefined);
  const [openNote, setOpenNote] = useState(false);
  const [openDetail, setOpenDetail] = useState(false);
  const meta = KIND_META[item.kind];
  const domain = DOMAIN_META[meta.domain];
  const done = state.status === "DONE";
  const missed = state.status === "MISSED";

  return (
    <li
      data-testid={`plan-item-${item.sourceKey}`}
      data-state={state.status}
      className={cn(
        "flex flex-col gap-2 border-l-2 py-3 pl-3",
        done && "opacity-60"
      )}
      style={{ borderLeftColor: domain.color }}
    >
      <div className="flex flex-wrap items-start gap-2">
        <span className="shrink-0 text-base" aria-hidden>{meta.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* The kind, spelled out. "School" alone does not tell you
                whether tonight is an hour of homework or a test tomorrow. */}
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ background: `color-mix(in oklab, ${domain.color} 25%, transparent)` }}
            >
              {meta.label}
            </span>
            {item.context && <span className="text-xs text-muted">{item.context}</span>}
            {item.time && <span className="text-xs tabular-nums text-muted">{item.time}</span>}
          </div>
          <p className={cn("mt-0.5 text-sm font-medium", done && "line-through")}>{item.title}</p>

          {item.detail.length > 0 && (
            <>
              {/* The first two lines are the ones you need standing in the
                  gym; the rest is there when you want it. */}
              <ul className="mt-1 flex flex-col gap-0.5">
                {(openDetail ? item.detail : item.detail.slice(0, 2)).map((line, index) => (
                  <li key={`${line.label}-${index}`} className="flex flex-wrap gap-x-2 text-xs text-muted">
                    <span>{line.label}</span>
                    {line.value && <span className="tabular-nums">{line.value}</span>}
                  </li>
                ))}
              </ul>
              {item.detail.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOpenDetail((open) => !open)}
                  className="mt-1 flex items-center gap-1 text-xs text-accent"
                >
                  {openDetail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  {openDetail ? "Less" : `All ${item.detail.length}`}
                </button>
              )}
            </>
          )}

          {(state.note || state.atTime) && (
            <p className="mt-1 rounded-lg bg-surface-muted px-2 py-1 text-xs text-muted" data-testid="plan-item-note">
              {state.atTime && <span className="font-medium">{state.atTime}</span>}
              {state.atTime && state.note ? " · " : ""}
              {state.note}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!done && !missed && (
            <>
              <StatusButton
                submit={submit}
                pending={pending}
                item={item}
                status="DONE"
                label="Mark done"
                className="text-muted hover:text-accent"
              >
                <Check size={16} />
              </StatusButton>
              <button
                type="button"
                onClick={() => setOpenNote((open) => !open)}
                aria-label={`Couldn't do ${item.title}`}
                title="Couldn't do it"
                className="rounded-full p-1 text-muted transition hover:text-danger"
              >
                <X size={16} />
              </button>
            </>
          )}
          {(done || missed) && (
            <>
              <span className={cn("text-xs font-medium", done ? "text-accent" : "text-danger")}>
                {done ? "Done" : "Missed"}
              </span>
              <StatusButton
                submit={submit}
                pending={pending}
                item={item}
                status=""
                label={`Undo ${item.title}`}
                className="text-muted hover:text-foreground"
              >
                <Undo2 size={14} />
              </StatusButton>
            </>
          )}
        </div>
      </div>

      {openNote && !done && !missed && (
        <form
          action={async (formData) => {
            await submit(formData);
            setOpenNote(false);
          }}
          className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted/40 p-2"
          data-testid={`plan-miss-form-${item.sourceKey}`}
        >
          <input type="hidden" name="sourceKey" value={item.sourceKey} />
          <input type="hidden" name="date" value={dayKey(item.date)} />
          <input type="hidden" name="status" value="MISSED" />
          <textarea
            name="note"
            rows={2}
            maxLength={MAX_PLAN_NOTE}
            placeholder="What got in the way? Write it however you like…"
            aria-label={`Why ${item.title} did not happen`}
            className="w-full resize-y rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="atTime"
              maxLength={MAX_PLAN_TIME}
              placeholder="When instead? e.g. Saturday 10:00"
              aria-label={`When ${item.title} happened instead`}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-surface-muted px-3 py-1.5 text-xs font-medium hover:bg-border disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setOpenNote(false)}
              className="rounded-lg px-2 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {result?.error && (
        <p className="rounded-lg bg-danger/10 px-2 py-1 text-xs text-danger" role="alert">{result.error}</p>
      )}

      <Link href={item.href} className="text-xs text-muted underline-offset-2 hover:text-accent hover:underline">
        Open in {domain.label}
      </Link>
    </li>
  );
}

function StatusButton({
  submit,
  pending,
  item,
  status,
  label,
  className,
  children,
}: {
  submit: (formData: FormData) => void;
  pending: boolean;
  item: PlanItem;
  status: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form action={submit}>
      <input type="hidden" name="sourceKey" value={item.sourceKey} />
      <input type="hidden" name="date" value={dayKey(item.date)} />
      <input type="hidden" name="status" value={status} />
      <button
        type="submit"
        disabled={pending}
        aria-label={label}
        title={label}
        className={cn("rounded-full p-1 transition disabled:opacity-50", className)}
      >
        {children}
      </button>
    </form>
  );
}
