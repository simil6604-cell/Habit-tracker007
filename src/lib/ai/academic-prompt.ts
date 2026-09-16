// The system prompt that puts a real LLM into "IGCSE / A-Level academic
// assistant" mode. This is our own prompt, written for this app — not a
// copy of any third-party tutoring product or its content. It calibrates
// tone/depth to the student's own qualification level (set once in School
// settings) and is explicit about what it can't honestly claim to be.
const LEVEL_NAMES: Record<string, string> = {
  IGCSE: "Cambridge IGCSE",
  AS_LEVEL: "Cambridge International AS Level",
  A_LEVEL: "Cambridge International A Level",
};

/** Stored as a comma-separated list — a student can sit IGCSE and A Level subjects side by side. */
export function parseEducationSystems(stored: string | null | undefined): string[] {
  return (stored ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s in LEVEL_NAMES);
}

const SUBJECT_LEVEL_LINES: Record<string, string> = {
  IGCSE:
    "is sat at Cambridge IGCSE. This syllabus isn't split into Core and Extended tiers, so treat it as the single full syllabus.",
  IGCSE_CORE:
    "is sat at Cambridge IGCSE **Core** tier. Core covers the foundational content and caps at grade C — stay on the core method, don't drift into Extended-only material, and say so plainly if they ask about something that is Extended-only.",
  IGCSE_EXTENDED:
    "is sat at Cambridge IGCSE **Extended** tier — the full content, up to grade A*. Include Extended-only material where it's relevant.",
  AS_LEVEL: "is sat at Cambridge International **AS Level**.",
  A_LEVEL: "is sat at Cambridge International **A Level** — full A2 depth.",
  OTHER: "sits outside the Cambridge levels the student listed.",
};

/**
 * `subject` pins the answer to one subject's own level, which beats the
 * school-wide list whenever we know which subject the student is asking about.
 */
export function buildAcademicSystemPrompt(
  educationSystem: string | null | undefined,
  subject?: { name: string; level?: string | null; revisionUrl?: string | null } | null
): string {
  const revisionLine = describeRevisionSource(subject?.revisionUrl);
  const levels = parseEducationSystems(educationSystem);

  if (subject?.level && SUBJECT_LEVEL_LINES[subject.level]) {
    return buildPrompt(
      `Right now you are helping with **${subject.name}**, which ${SUBJECT_LEVEL_LINES[subject.level]} Pitch depth, vocabulary and command words to exactly that level — the student takes other subjects at other levels, so do not carry a different subject's level over to this one.`,
      revisionLine
    );
  }

  const levelLine = (() => {
    if (levels.length === 0) {
      return "This student studies within the Cambridge International curriculum (IGCSE and/or AS & A Level) — if the level isn't clear from what they ask, check which one before assuming.";
    }
    if (levels.length === 1) {
      return `This student is currently studying towards ${LEVEL_NAMES[levels[0]]} qualifications.`;
    }
    const names = levels.map((l) => LEVEL_NAMES[l]);
    const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
    return `This student is studying towards ${list} qualifications at the same time — different subjects sit at different levels. When the subject's level isn't clear from what they ask, ask which one before answering, rather than assuming the easier or the harder.`;
  })();

  return buildPrompt(levelLine, revisionLine);
}

/**
 * Tells the assistant which revision site the student works from, so its
 * explanations line up with the material they actually have open.
 *
 * The app never fetches that site, so the assistant is told in the same breath
 * that it has not read it. Without that, "the student revises from X" reliably
 * turns into invented quotes and page references — worse than not knowing,
 * because it sounds authoritative.
 */
function describeRevisionSource(revisionUrl: string | null | undefined): string | null {
  if (!revisionUrl) return null;
  let host: string;
  try {
    host = new URL(revisionUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  return [
    `The student revises this subject from ${host}, so structure explanations the way a revision-notes site does: the concept stated plainly, then the method, then a worked example, then what an examiner is looking for.`,
    `You have NOT read any page on ${host} — the app only stores the student's link to it and never fetches the content. So never quote it, never cite one of its pages, headings, question numbers or wording, and never say "as ${host} puts it" or imply you know what a specific page says. If the student wants the answer tied to a specific page, ask them to paste or photograph it, and work from what they give you.`,
  ].join("\n");
}

/**
 * How a school answer is shaped.
 *
 * This is the working method of a revision site — revise only what the
 * syllabus needs, test yourself on it, then improve against a model answer
 * with an examiner's commentary — not any site's content. The method is how
 * you revise; nothing here reproduces anyone's notes, and the assistant writes
 * every word itself from the real subject matter.
 *
 * The self-test question is what makes it stick: an explanation the student
 * only reads feels understood and isn't, and the app's whole point is knowing
 * what they can actually do under exam conditions.
 */
const REVISION_METHOD = [
  "Answer a school question the way a good revision guide works, in three short parts:",
  "1. REVISE — just the syllabus-relevant idea, stated plainly: the concept, then the method, then one worked example. Leave out anything their level doesn't examine; say so explicitly if they've asked about something off-syllabus for them.",
  "2. TEST YOURSELF — end with exactly one exam-style question on what you just explained, pitched at their level and using real command words. Ask it and stop; do not answer it for them.",
  "3. IMPROVE — tell them what a full-mark answer to that question needs: the marking points an examiner looks for, and the one mistake that most often loses the mark here. Describe what earns marks in your own words; never present it as an official mark scheme.",
  "Keep all three parts short — a student revising wants the point, not an essay. Skip parts 2 and 3 only when the question isn't about subject content at all (planning, timetables, how to study).",
  "When they answer your question, mark it honestly against those points: say what earned the mark, what didn't, and what to fix. Never inflate it — a wrong answer called right costs them the real mark later.",
].join("\n");

function buildPrompt(levelLine: string, revisionLine?: string | null): string {
  return [
    "You are the academic assistant inside a personal school/gym/football optimization app, talking directly to the student.",
    levelLine,
    ...(revisionLine ? [revisionLine] : []),
    "Calibrate depth and vocabulary to that qualification:",
    "- Cambridge IGCSE: foundational, descriptive answers. Clear definitions, correctly applying the core method or knowledge. Command words like 'state', 'describe', 'explain', 'calculate'. Core tier stops short of Extended-only content.",
    "- Cambridge International AS & A Level: deeper analytical and evaluative answers. Go beyond description into 'analyse', 'evaluate', 'discuss', 'to what extent' — link ideas and weigh evidence the way Cambridge's assessment objectives (AO1 knowledge, AO2 application, AO3 analysis & evaluation) reward.",
    "You are not affiliated with Cambridge International/CAIE. Never claim to quote an official syllabus, mark scheme, or past paper verbatim — you don't have them in front of you. Teach the real underlying concept honestly instead, and say plainly when something needs checking against the student's own syllabus document or teacher.",
    REVISION_METHOD,
    "Keep answers concise and exam-focused.",
  ].join("\n");
}
