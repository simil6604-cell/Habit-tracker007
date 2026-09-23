export const FOOTBALL_POSITIONS = [
  { value: "GK", label: "Goalkeeper" },
  { value: "CB", label: "Centre Back" },
  { value: "LB", label: "Left Back" },
  { value: "RB", label: "Right Back" },
  { value: "CDM", label: "Defensive Midfielder" },
  { value: "CM", label: "Central Midfielder" },
  { value: "CAM", label: "Attacking Midfielder" },
  { value: "LW", label: "Left Winger" },
  { value: "RW", label: "Right Winger" },
  { value: "ST", label: "Striker" },
] as const;

export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number]["value"];

export const FOOTBALL_SKILLS = [
  "Technique",
  "Dribbling",
  "Passing",
  "First Touch",
  "Shooting",
  "Speed",
  "Agility",
  "Ball Control",
  "Weak Foot",
  "Decision Making",
  "Conditioning",
  "Heading",
  "Tackling",
  "Positioning",
];

// Position-specific drill emphasis used by the training generator (lib/planner/football.ts).
export const POSITION_FOCUS: Record<FootballPosition, string[]> = {
  GK: ["Shot Stopping", "Distribution", "Positioning", "Reflexes"],
  CB: ["Tackling", "Heading", "Positioning", "Passing"],
  LB: ["Speed", "Crossing", "Tackling", "Conditioning"],
  RB: ["Speed", "Crossing", "Tackling", "Conditioning"],
  CDM: ["Passing", "Positioning", "Tackling", "Decision Making"],
  CM: ["Passing", "First Touch", "Decision Making", "Conditioning"],
  CAM: ["First Touch", "Passing", "Shooting", "Decision Making"],
  LW: ["Dribbling", "Speed", "Weak Foot", "Shooting"],
  RW: ["Dribbling", "Speed", "Weak Foot", "Shooting"],
  ST: ["Shooting", "First Touch", "Positioning", "Weak Foot"],
};

// Short cue reminders per drill/skill — general reference, not a substitute for a coach.
export const DRILL_CUES: Record<string, string> = {
  "Shot Stopping": "Set position, hands behind the ball, push don't punch when you can catch.",
  Distribution: "Pick your head up before releasing — accuracy over power.",
  Reflexes: "Stay on the balls of your feet, small adjustment steps.",
  Tackling: "Time the tackle to when the ball is slightly away from their feet.",
  Heading: "Attack the ball, eyes open, use your neck and upper body, not just your head.",
  Positioning: "Think one pass ahead — where will the ball go next?",
  Passing: "Open body shape, weight the pass for the receiver's next touch.",
  Speed: "Short, quick first steps before reaching full stride.",
  Crossing: "Look up before crossing, aim for the space, not just a player.",
  Conditioning: "Consistent effort over the full session beats short bursts.",
  "First Touch": "Cushion the ball into space away from pressure, don't just stop it dead.",
  "Decision Making": "Scan before you receive — know your options before the ball arrives.",
  Shooting: "Plant foot beside the ball, strike through the middle, follow through.",
  Dribbling: "Small touches at speed, change of pace beats pure skill moves.",
  "Weak Foot": "Start slow and controlled — speed comes after control, not before.",
  Technique: "Quality reps over quantity — stay focused on clean execution.",
  "Ball Control": "Keep the ball close, use both feet, eyes up between touches.",
  Agility: "Low centre of gravity, plant and push off hard — change direction on one step, not three.",
};

/**
 * Example-drill videos per skill: real, existing videos found by search, never
 * guessed. A guessed eleven-character YouTube id is not a broken link you can
 * see — it is a different video entirely, and the embed plays it.
 *
 * Up to three per skill, because one example is one coach's way of doing it.
 * Several skills share a video where the closest real match covers more than
 * one of them (the goalkeeping topics, technique and ball control).
 *
 * Skills with fewer than three here are not a gap to be filled by inventing
 * ids: the panel offers a search for that skill and a place to save the videos
 * you actually rate, which is the same rule the rest of this app follows —
 * videos are saved by you, never invented or fetched by the app.
 */
export const DRILL_VIDEOS: Record<string, string[]> = {
  "Shot Stopping": ["https://www.youtube.com/watch?v=Jpe1O9YPU9w"],
  Distribution: ["https://www.youtube.com/watch?v=Jpe1O9YPU9w"],
  Reflexes: ["https://www.youtube.com/watch?v=Jpe1O9YPU9w"],
  Tackling: ["https://www.youtube.com/watch?v=WnJRUuvakWM"],
  Heading: ["https://www.youtube.com/watch?v=D_i_kHxu94k"],
  Positioning: ["https://www.youtube.com/watch?v=Fa_ajf77Vws"],
  Passing: ["https://www.youtube.com/watch?v=F8LCioV8z_s"],
  Speed: ["https://www.youtube.com/watch?v=yaUO5rrzJzM"],
  Crossing: ["https://www.youtube.com/watch?v=X8iX2UXlmsQ"],
  Conditioning: ["https://www.youtube.com/watch?v=JDK1BBiq-sU"],
  "First Touch": ["https://www.youtube.com/watch?v=z2cTS6fbJck"],
  "Decision Making": ["https://www.youtube.com/watch?v=Fa_ajf77Vws"],
  Shooting: ["https://www.youtube.com/watch?v=QDb5-cMIbjM"],
  Dribbling: ["https://www.youtube.com/watch?v=3a0eRXTqfOo"],
  "Weak Foot": ["https://www.youtube.com/watch?v=EW4N16-0obw"],
  Technique: ["https://www.youtube.com/watch?v=PdPHBd33R68"],
  "Ball Control": ["https://www.youtube.com/watch?v=PdPHBd33R68"],
};

/** Up to three videos per skill: suggested ones plus the ones you save. */
export const MAX_DRILL_VIDEOS_PER_SKILL = 3;

/**
 * Never more than the panel promises. Kept separate from the lookup so the cap
 * is testable on a list that actually exceeds it — asserting it against a table
 * where nothing does is a test that passes with the cap deleted.
 */
export function capDrillVideos(urls: string[]): string[] {
  return urls.slice(0, MAX_DRILL_VIDEOS_PER_SKILL);
}

/** The suggested videos for a skill, capped. */
export function suggestedDrillVideos(skill: string): string[] {
  return capDrillVideos(DRILL_VIDEOS[skill] ?? []);
}

/**
 * Why a link can't be saved for this skill, or null if it can.
 *
 * Pure and separate from the action so the limit is testable without a
 * database — an end-to-end test that saves one video never reaches the cap,
 * so it passes with the cap deleted.
 */
export function drillVideoRejection(existingUrls: string[], url: string): string | null {
  if (existingUrls.length >= MAX_DRILL_VIDEOS_PER_SKILL) {
    return `${MAX_DRILL_VIDEOS_PER_SKILL} of your own is the limit per skill — remove one first.`;
  }
  if (existingUrls.includes(url)) return "That one is already saved for this skill.";
  return null;
}

/**
 * Where to go looking for more, for any skill — including the ones with no
 * suggestion at all. A search URL is a link this app can offer without
 * claiming to know which video sits behind it.
 */
export function drillSearchUrl(skill: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`football ${skill} drills training`)}`;
}

export const GYM_GOALS = [
  "Improve strength",
  "Improve fitness",
  "Build muscle",
  "Improve football performance",
  "Improve consistency",
];
