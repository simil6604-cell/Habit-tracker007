export type LibraryExercise = {
  name: string;
  equipment: string; // emoji, stands in for a real equipment photo
  muscleGroup: string;
  cue: string;
};

// A curated reference list — not a substitute for a coach or PT. Cues are
// general safety/form reminders, not medical or biomechanical guarantees.
export const EXERCISE_LIBRARY: LibraryExercise[] = [
  { name: "Bench Press", equipment: "🏋️", muscleGroup: "Chest", cue: "Flat back on the bench, bar to mid-chest, drive feet into the floor." },
  { name: "Incline Dumbbell Press", equipment: "🏋️", muscleGroup: "Chest", cue: "Bench at 30-45°, control the descent, don't flare elbows to 90°." },
  { name: "Lat Pulldown", equipment: "🏗️", muscleGroup: "Back", cue: "Pull to upper chest, squeeze shoulder blades, avoid leaning back too far." },
  { name: "Barbell Row", equipment: "🏋️", muscleGroup: "Back", cue: "Hinge at hips, flat back, pull to lower ribs." },
  { name: "Deadlift", equipment: "🏋️", muscleGroup: "Back/Legs", cue: "Bar over midfoot, neutral spine, push the floor away." },
  { name: "Shoulder Press", equipment: "🏋️", muscleGroup: "Shoulders", cue: "Brace your core, press straight up, avoid arching your lower back." },
  { name: "Lateral Raise", equipment: "🏋️", muscleGroup: "Shoulders", cue: "Slight bend in elbows, raise to shoulder height, control the negative." },
  { name: "Squat", equipment: "🏋️", muscleGroup: "Legs", cue: "Knees track over toes, chest up, hips and knees extend together." },
  { name: "Leg Press", equipment: "🏗️", muscleGroup: "Legs", cue: "Full range without locking knees hard, feet shoulder-width." },
  { name: "Romanian Deadlift", equipment: "🏋️", muscleGroup: "Legs", cue: "Soft knees, push hips back, feel it in the hamstrings." },
  { name: "Bicep Curl", equipment: "🏋️", muscleGroup: "Arms", cue: "Elbows pinned to sides, no swinging." },
  { name: "Tricep Pushdown", equipment: "🏗️", muscleGroup: "Arms", cue: "Elbows fixed at sides, full extension without locking hard." },
  { name: "Plank", equipment: "🧘", muscleGroup: "Core", cue: "Straight line head to heels, don't let hips sag." },
  { name: "Cable Crunch", equipment: "🏗️", muscleGroup: "Core", cue: "Curl the spine, not just the hips — think chin to knees." },
  { name: "Pull-Up", equipment: "🧗", muscleGroup: "Back", cue: "Full hang at the bottom, chin over the bar at the top." },
];
