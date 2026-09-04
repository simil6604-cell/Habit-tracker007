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

export const GYM_GOALS = [
  "Improve strength",
  "Improve fitness",
  "Build muscle",
  "Improve football performance",
  "Improve consistency",
];
