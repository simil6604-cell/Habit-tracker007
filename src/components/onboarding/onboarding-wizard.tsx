"use client";

import { useMemo, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EDUCATION_SYSTEMS, CAMBRIDGE_SUBJECTS } from "@/lib/data/cambridge";
import { FOOTBALL_POSITIONS, FOOTBALL_SKILLS, GYM_GOALS } from "@/lib/data/football";
import { completeOnboarding, type OnboardingPayload } from "@/lib/onboarding/actions";

type Domain = "optimizeSchool" | "optimizeGym" | "optimizeFootball";
type MainFocus = "school" | "gym" | "football" | "balanced";

/** One subject-picking section per education system, in the order a student meets them. */
const SUBJECT_SECTIONS = [
  {
    value: "IGCSE",
    level: "IGCSE_CORE",
    subjectsHeading: "🎓 Your IGCSE subjects",
    subjectsHint: "Pick the subjects you're sitting at IGCSE, then set Core or Extended for each.",
  },
  {
    value: "AS_LEVEL",
    level: "AS_LEVEL",
    subjectsHeading: "📘 Your AS Level subjects",
    subjectsHint: "Pick the subjects you're sitting at AS Level.",
  },
  {
    value: "A_LEVEL",
    level: "A_LEVEL",
    subjectsHeading: "📗 Your A Level subjects",
    subjectsHint: "Pick the subjects you're sitting at A Level — most students take 3.",
  },
  {
    value: "OTHER",
    level: "OTHER",
    subjectsHeading: "📚 Your other subjects",
    subjectsHint: "Subjects outside the Cambridge levels above.",
  },
] as const;

const DOMAIN_CARDS: { key: Domain; emoji: string; title: string; desc: string }[] = [
  { key: "optimizeSchool", emoji: "🎓", title: "School", desc: "Timetable, exams, study plans" },
  { key: "optimizeGym", emoji: "🏋️", title: "Gym", desc: "Workouts, strength, consistency" },
  { key: "optimizeFootball", emoji: "⚽", title: "Football", desc: "Training, team, match prep" },
];

function Toggle({ selected, onClick, emoji, title, desc }: { selected: boolean; onClick: () => void; emoji: string; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-1 flex-col items-center gap-2 rounded-2xl border-2 p-6 text-center transition",
        selected
          ? "border-accent bg-accent/20 ring-2 ring-accent/40"
          : "border-border bg-surface opacity-55 hover:opacity-80 hover:bg-surface-muted"
      )}
    >
      <span
        className={cn(
          "absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition",
          selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-transparent"
        )}
      >
        {selected && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="text-4xl">{emoji}</span>
      <span className="font-semibold">{title}</span>
      <span className="text-xs text-muted">{desc}</span>
    </button>
  );
}

function Chip({
  selected,
  onClick,
  children,
  disabled,
  title,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={selected}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition",
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : disabled
            ? "cursor-not-allowed border-border bg-surface text-muted opacity-35"
            : "border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground"
      )}
    >
      {selected && <Check size={13} strokeWidth={3} />}
      {children}
    </button>
  );
}

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [domains, setDomains] = useState<Record<Domain, boolean>>({
    optimizeSchool: true,
    optimizeGym: true,
    optimizeFootball: true,
  });
  const [mainFocus, setMainFocus] = useState<MainFocus>("balanced");

  const selectedCount = Object.values(domains).filter(Boolean).length;
  const allSelected = selectedCount === 3;

  const focusOptions = useMemo(() => {
    const opts = DOMAIN_CARDS.filter((d) => domains[d.key]).map((d) => ({
      value: d.key.replace("optimize", "").toLowerCase() as MainFocus,
      emoji: d.emoji,
      title: d.title,
      desc: `${d.title} comes first when there isn't time for everything`,
    }));
    return [
      ...opts,
      { value: "balanced" as MainFocus, emoji: "⚖️", title: "Balanced", desc: "Keep all of them roughly equal" },
    ];
  }, [domains]);

  const [schoolName, setSchoolName] = useState("");
  const [educationSystems, setEducationSystems] = useState<string[]>(["IGCSE"]);
  // Subjects are chosen per education system, so "IGCSE Maths" and "A Level
  // Economics" stay visibly separate instead of collapsing into one flat list.
  const [subjectsBySystem, setSubjectsBySystem] = useState<Record<string, string[]>>({});
  const [igcseTiers, setIgcseTiers] = useState<Record<string, string>>({});

  const orderedSystems = useMemo(
    () => SUBJECT_SECTIONS.filter((s) => educationSystems.includes(s.value)),
    [educationSystems]
  );

  /** Which system a subject is already claimed by, so it can't be picked twice. */
  function takenBy(subjectName: string): string | null {
    for (const [system, names] of Object.entries(subjectsBySystem)) {
      if (names.includes(subjectName)) return system;
    }
    return null;
  }

  function systemLabel(system: string) {
    return EDUCATION_SYSTEMS.find((s) => s.value === system)?.label ?? system;
  }

  function toggleSubjectFor(system: string, name: string) {
    setSubjectsBySystem((prev) => {
      const current = prev[system] ?? [];
      return {
        ...prev,
        [system]: current.includes(name) ? current.filter((n) => n !== name) : [...current, name],
      };
    });
  }

  /** Flattened for the payload: every chosen subject with the level it sits at. */
  const chosenSubjects = useMemo(() => {
    const out: { name: string; level: string }[] = [];
    for (const sys of orderedSystems) {
      for (const name of subjectsBySystem[sys.value] ?? []) {
        out.push({
          name,
          level: sys.value === "IGCSE" ? igcseTiers[name] ?? "IGCSE_CORE" : sys.level,
        });
      }
    }
    return out;
  }, [orderedSystems, subjectsBySystem, igcseTiers]);
  const [yearGroup, setYearGroup] = useState("");

  const [gymGoals, setGymGoals] = useState<string[]>(["Improve consistency"]);

  const [footballPosition, setFootballPosition] = useState("ST");
  const [footballTeamName, setFootballTeamName] = useState("");
  const [footballWeaknesses, setFootballWeaknesses] = useState<string[]>([]);

  const steps = useMemo(() => {
    const s = ["intro"];
    // Only worth asking which area leads when more than one is in play.
    if (selectedCount > 1) s.push("focus");
    if (domains.optimizeSchool) s.push("school");
    if (domains.optimizeGym) s.push("gym");
    if (domains.optimizeFootball) s.push("football");
    s.push("review");
    return s;
  }, [domains, selectedCount]);

  const current = steps[step];

  function toggleDomain(key: Domain) {
    setDomains((d) => {
      const nextDomains = { ...d, [key]: !d[key] };
      // Turning off the area you'd named as your focus makes that answer stale.
      if (!nextDomains[key] && mainFocus === key.replace("optimize", "").toLowerCase()) {
        setMainFocus("balanced");
      }
      return nextDomains;
    });
  }
  function toggleFromList(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function next() {
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  function submit() {
    const payload: OnboardingPayload = {
      optimizeSchool: domains.optimizeSchool,
      optimizeGym: domains.optimizeGym,
      optimizeFootball: domains.optimizeFootball,
      mainFocus,
      schoolName: schoolName || "My School",
      educationSystem: educationSystems.join(","),
      yearGroup,
      subjects: chosenSubjects.map((s) => s.name),
      subjectLevels: Object.fromEntries(chosenSubjects.map((s) => [s.name, s.level])),
      gymGoals,
      footballPosition,
      footballTeamName,
      footballStrengths: [],
      footballWeaknesses,
    };
    setError(null);
    startTransition(async () => {
      try {
        await completeOnboarding(payload);
      } catch (e) {
        if (e instanceof Error && e.message === "NEXT_REDIRECT") return;
        setError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-10">
      <div className="mb-8 flex items-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-accent" : "bg-surface-muted")} />
        ))}
      </div>

      {current === "intro" && (
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight">What do you want to optimize?</h1>
          <p className="mt-1 text-sm text-muted">
            Pick everything that applies — you can have all three on at once. You can change this later in Settings.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {DOMAIN_CARDS.map((d) => (
              <Toggle key={d.key} selected={domains[d.key]} onClick={() => toggleDomain(d.key)} emoji={d.emoji} title={d.title} desc={d.desc} />
            ))}
          </div>
          {!allSelected && (
            <button
              type="button"
              onClick={() => setDomains({ optimizeSchool: true, optimizeGym: true, optimizeFootball: true })}
              className="mt-3 text-xs font-medium text-accent hover:underline"
            >
              Select all three
            </button>
          )}
          {selectedCount === 0 && (
            <p className="mt-3 text-xs text-danger">Pick at least one to continue.</p>
          )}
        </div>
      )}

      {current === "focus" && (
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight">Where does most of your effort go?</h1>
          <p className="mt-1 text-sm text-muted">
            When school, training and gym want the same hours, the coach leans toward your main focus. Pick
            &ldquo;Balanced&rdquo; if none of them comes first.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {focusOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setMainFocus(o.value)}
                aria-pressed={mainFocus === o.value}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition",
                  mainFocus === o.value
                    ? "border-accent bg-accent/20 ring-2 ring-accent/40"
                    : "border-border bg-surface opacity-60 hover:opacity-90 hover:bg-surface-muted"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                    mainFocus === o.value ? "border-accent bg-accent text-accent-foreground" : "border-border"
                  )}
                >
                  {mainFocus === o.value && <Check size={14} strokeWidth={3} />}
                </span>
                <span className="text-2xl">{o.emoji}</span>
                <span className="flex flex-col">
                  <span className="font-semibold">{o.title}</span>
                  <span className="text-xs text-muted">{o.desc}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {current === "school" && (
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight">🎓 Your school</h1>
          <p className="mt-1 text-sm text-muted">This helps the AI Coach understand your academic workload.</p>
          <div className="mt-6 flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">School name</label>
              <input
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                placeholder="e.g. Riverside International School"
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                Education system — pick every level you&rsquo;re taking
              </label>
              <div className="flex flex-wrap gap-2">
                {EDUCATION_SYSTEMS.map((sys) => (
                  <Chip
                    key={sys.value}
                    selected={educationSystems.includes(sys.value)}
                    onClick={() => toggleFromList(educationSystems, setEducationSystems, sys.value)}
                  >
                    {sys.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">
                Doing IGCSE and A Level subjects side by side? Select both — the AI then asks which level a
                question is at instead of guessing.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Year group (optional)</label>
              <input
                value={yearGroup}
                onChange={(e) => setYearGroup(e.target.value)}
                placeholder="e.g. Year 11"
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            {orderedSystems.map((sys) => {
              const picked = subjectsBySystem[sys.value] ?? [];
              return (
                <div key={sys.value} className="rounded-xl border border-border bg-surface p-3.5">
                  <label className="mb-0.5 block text-sm font-semibold">{sys.subjectsHeading}</label>
                  <p className="mb-2.5 text-xs text-muted">{sys.subjectsHint}</p>
                  <div className="flex flex-wrap gap-2">
                    {CAMBRIDGE_SUBJECTS.map((s) => {
                      const owner = takenBy(s);
                      const takenElsewhere = owner !== null && owner !== sys.value;
                      return (
                        <Chip
                          key={s}
                          selected={picked.includes(s)}
                          disabled={takenElsewhere}
                          title={takenElsewhere ? `Already picked under ${systemLabel(owner)}` : undefined}
                          onClick={() => toggleSubjectFor(sys.value, s)}
                        >
                          {s}
                        </Chip>
                      );
                    })}
                  </div>

                  {sys.value === "IGCSE" && picked.length > 0 && (
                    <div className="mt-3 border-t border-border pt-3">
                      <label className="mb-2 block text-xs font-medium text-muted">
                        Core or Extended for each?
                      </label>
                      <div className="flex flex-col gap-2">
                        {picked.map((name) => (
                          <div key={name} className="flex flex-wrap items-center gap-2">
                            <span className="min-w-32 flex-1 text-sm">{name}</span>
                            <div className="flex gap-1.5">
                              {(["IGCSE_CORE", "IGCSE_EXTENDED"] as const).map((tier) => (
                                <button
                                  key={tier}
                                  type="button"
                                  onClick={() => setIgcseTiers((prev) => ({ ...prev, [name]: tier }))}
                                  aria-pressed={(igcseTiers[name] ?? "IGCSE_CORE") === tier}
                                  className={cn(
                                    "rounded-full border-2 px-3 py-1 text-xs font-medium transition",
                                    (igcseTiers[name] ?? "IGCSE_CORE") === tier
                                      ? "border-accent bg-accent text-accent-foreground"
                                      : "border-border bg-surface-muted text-muted hover:text-foreground"
                                  )}
                                >
                                  {tier === "IGCSE_CORE" ? "Core" : "Extended"}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        Core caps at grade C and leaves out Extended-only content — the AI sticks to whichever tier
                        you set here.
                      </p>
                    </div>
                  )}

                  {sys.value === "A_LEVEL" && picked.length > 0 && picked.length < 3 && (
                    <p className="mt-2 text-xs text-muted">
                      Most students take 3 A Levels — you&rsquo;ve picked {picked.length}. More or fewer is fine.
                    </p>
                  )}
                </div>
              );
            })}

            {orderedSystems.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-3.5 text-xs text-muted">
                Pick at least one education system above to choose your subjects.
              </p>
            )}
          </div>
        </div>
      )}

      {current === "gym" && (
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight">🏋️ Your gym goals</h1>
          <p className="mt-1 text-sm text-muted">Choose realistic, sustainable goals — no crash plans.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {GYM_GOALS.map((g) => (
              <Chip key={g} selected={gymGoals.includes(g)} onClick={() => toggleFromList(gymGoals, setGymGoals, g)}>
                {g}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {current === "football" && (
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight">⚽ Your football profile</h1>
          <div className="mt-6 flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Position</label>
              <div className="flex flex-wrap gap-2">
                {FOOTBALL_POSITIONS.map((p) => (
                  <Chip key={p.value} selected={footballPosition === p.value} onClick={() => setFootballPosition(p.value)}>
                    {p.value}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Team name (optional)</label>
              <input
                value={footballTeamName}
                onChange={(e) => setFootballTeamName(e.target.value)}
                placeholder="e.g. Riverside U17"
                className="w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Your weaknesses (optional)</label>
              <div className="flex flex-wrap gap-2">
                {FOOTBALL_SKILLS.map((s) => (
                  <Chip key={s} selected={footballWeaknesses.includes(s)} onClick={() => toggleFromList(footballWeaknesses, setFootballWeaknesses, s)}>
                    {s}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {current === "review" && (
        <div className="animate-fade-in-up">
          <h1 className="text-2xl font-semibold tracking-tight">You&apos;re all set</h1>
          <p className="mt-1 text-sm text-muted">
            The AI Coach will build your first weekly plan from what you entered. You can refine timetables, exams and
            training details afterwards in each section.
          </p>
          <div className="mt-6 flex flex-col gap-2 rounded-xl border border-border bg-surface-muted p-4 text-sm">
            {domains.optimizeSchool && <p>🎓 {schoolName || "My School"} · {chosenSubjects.length} subjects</p>}
            {domains.optimizeGym && <p>🏋️ Goals: {gymGoals.join(", ") || "none selected"}</p>}
            {domains.optimizeFootball && <p>⚽ Position: {footballPosition}{footballTeamName ? ` · ${footballTeamName}` : ""}</p>}
          </div>
          {error && <p className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
      )}

      <div className="mt-10 flex items-center justify-between">
        <Button variant="ghost" onClick={back} disabled={step === 0 || pending}>
          Back
        </Button>
        {current === "review" ? (
          <Button onClick={submit} disabled={pending}>
            {pending ? "Creating your plan…" : "Finish setup"}
          </Button>
        ) : (
          <Button onClick={next} disabled={pending || (current === "intro" && selectedCount === 0)}>
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}
