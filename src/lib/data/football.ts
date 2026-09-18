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
};

// One real, existing example-drill video per skill (verified via search, not
// guessed) — a starting point to watch before you train, not a replacement
// for a coach. Several skills share a video where the closest real match
// covers more than one of them (e.g. goalkeeping topics, ball control).
export const DRILL_VIDEOS: Record<string, string> = {
  "Shot Stopping": "https://www.youtube.com/watch?v=Jpe1O9YPU9w",
  Distribution: "https://www.youtube.com/watch?v=Jpe1O9YPU9w",
  Reflexes: "https://www.youtube.com/watch?v=Jpe1O9YPU9w",
  Tackling: "https://www.youtube.com/watch?v=WnJRUuvakWM",
  Heading: "https://www.youtube.com/watch?v=D_i_kHxu94k",
  Positioning: "https://www.youtube.com/watch?v=Fa_ajf77Vws",
  Passing: "https://www.youtube.com/watch?v=F8LCioV8z_s",
  Speed: "https://www.youtube.com/watch?v=yaUO5rrzJzM",
  Crossing: "https://www.youtube.com/watch?v=X8iX2UXlmsQ",
  Conditioning: "https://www.youtube.com/watch?v=JDK1BBiq-sU",
  "First Touch": "https://www.youtube.com/watch?v=z2cTS6fbJck",
  "Decision Making": "https://www.youtube.com/watch?v=Fa_ajf77Vws",
  Shooting: "https://www.youtube.com/watch?v=QDb5-cMIbjM",
  Dribbling: "https://www.youtube.com/watch?v=3a0eRXTqfOo",
  "Weak Foot": "https://www.youtube.com/watch?v=EW4N16-0obw",
  Technique: "https://www.youtube.com/watch?v=PdPHBd33R68",
  "Ball Control": "https://www.youtube.com/watch?v=PdPHBd33R68",
};

export const GYM_GOALS = [
  "Improve strength",
  "Improve fitness",
  "Build muscle",
  "Improve football performance",
  "Improve consistency",
];
