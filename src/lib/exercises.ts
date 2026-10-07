/**
 * The exercise library: common lifts, grouped by muscle and equipment, each
 * with two short form cues. Members can add their own (see training.ts).
 *
 * Ids are permanent: workouts and programs refer to exercises by id, so an id
 * must never be renamed or reused. Names and cues can change freely.
 *
 * `bodyweight` exercises log added weight (blank = none), and their progress
 * is measured in reps rather than load.
 *
 * `video` is an optional demo link (https). Without one, "Watch a demo" opens a
 * YouTube search for the exercise.
 */

export const MUSCLES = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quads",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  core: "Core",
};

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "machine",
  "cable",
  "smith",
  "ez-bar",
  "kettlebell",
  "bodyweight",
  "other",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  machine: "Machine",
  cable: "Cable",
  smith: "Smith machine",
  "ez-bar": "EZ bar",
  kettlebell: "Kettlebell",
  bodyweight: "Bodyweight",
  other: "Other",
};

export interface Exercise {
  id: string;
  name: string;
  muscle: Muscle;
  equipment: Equipment;
  /** Two short form cues. Empty for a member's own exercise without notes. */
  cues: string[];
  /** Progress is tracked in reps; the weight field is added weight. */
  bodyweight: boolean;
  /** Optional demo video (https). */
  video: string | null;
  /** True for exercises a member added themselves. */
  custom: boolean;
}

type Row = [id: string, name: string, muscle: Muscle, equipment: Equipment, cue1: string, cue2: string];

const ROWS: Row[] = [
  // Chest
  ["bench-press", "Barbell bench press", "chest", "barbell", "Shoulder blades pinched and down", "Bar to lower chest, elbows about 45°"],
  ["incline-bench-press", "Incline barbell bench press", "chest", "barbell", "Bench at 30–45°", "Bar to upper chest"],
  ["db-bench-press", "Dumbbell bench press", "chest", "dumbbell", "Lower to a deep stretch at the chest", "Press up and slightly in"],
  ["incline-db-press", "Incline dumbbell press", "chest", "dumbbell", "Bench at about 30°", "Elbows slightly tucked, not flared"],
  ["machine-chest-press", "Machine chest press", "chest", "machine", "Handles level with mid-chest", "Shoulder blades stay back on the pad"],
  ["smith-incline-press", "Smith machine incline press", "chest", "smith", "Set the bench so the bar meets upper chest", "Control the lowering"],
  ["cable-fly", "Cable fly", "chest", "cable", "Slight bend in the elbows, fixed throughout", "Squeeze hands together in front of the chest"],
  ["pec-deck", "Pec deck", "chest", "machine", "Elbows level with shoulders", "Pause at the squeeze"],
  ["db-fly", "Dumbbell fly", "chest", "dumbbell", "Wide arc with soft elbows", "Stop at a comfortable stretch"],
  ["push-up", "Push-up", "chest", "bodyweight", "Body in one straight line", "Chest to just above the floor"],
  ["chest-dip", "Chest dip", "chest", "bodyweight", "Lean forward slightly", "Lower until shoulders are just below elbows"],
  // Back
  ["deadlift", "Deadlift", "back", "barbell", "Bar over mid-foot, back flat", "Push the floor away, finish with the glutes"],
  ["barbell-row", "Barbell row", "back", "barbell", "Hinge to about 45° with a flat back", "Pull the bar to your lower ribs"],
  ["pull-up", "Pull-up", "back", "bodyweight", "Start from a dead hang", "Pull your chest toward the bar"],
  ["chin-up", "Chin-up", "back", "bodyweight", "Palms facing you", "Full range, chin over the bar"],
  ["lat-pulldown", "Lat pulldown", "back", "cable", "Lean back slightly, chest up", "Drive elbows down to your sides"],
  ["seated-cable-row", "Seated cable row", "back", "cable", "Sit tall, no rocking", "Pull to your stomach, squeeze shoulder blades"],
  ["db-row", "One-arm dumbbell row", "back", "dumbbell", "Flat back, free hand on the bench", "Pull your elbow toward your hip"],
  ["chest-supported-row", "Chest-supported row", "back", "machine", "Chest stays on the pad", "Squeeze shoulder blades at the top"],
  ["t-bar-row", "T-bar row", "back", "barbell", "Hinge with a flat back", "Pull to the chest without jerking"],
  ["straight-arm-pulldown", "Straight-arm pulldown", "back", "cable", "Arms nearly straight", "Sweep the bar down to your thighs"],
  ["rack-pull", "Rack pull", "back", "barbell", "Bar starts just below the knees", "Lock out with the hips, don't lean back"],
  ["back-extension", "Back extension", "back", "bodyweight", "Hinge at the hips", "Stop when your body is in a straight line"],
  ["db-shrug", "Dumbbell shrug", "back", "dumbbell", "Shoulders straight up toward your ears", "Pause at the top, no rolling"],
  // Shoulders
  ["overhead-press", "Overhead press", "shoulders", "barbell", "Squeeze glutes, ribs down", "Press straight up, head through at the top"],
  ["db-shoulder-press", "Seated dumbbell shoulder press", "shoulders", "dumbbell", "Back against the pad", "Lower to ear level"],
  ["machine-shoulder-press", "Machine shoulder press", "shoulders", "machine", "Handles at shoulder height to start", "Press without shrugging"],
  ["arnold-press", "Arnold press", "shoulders", "dumbbell", "Start with palms facing you", "Rotate the palms out as you press"],
  ["lateral-raise", "Dumbbell lateral raise", "shoulders", "dumbbell", "Lead with the elbows", "Raise to shoulder height, no swinging"],
  ["cable-lateral-raise", "Cable lateral raise", "shoulders", "cable", "Stand side-on to a low pulley", "Slow on the way down"],
  ["rear-delt-fly", "Rear delt fly", "shoulders", "dumbbell", "Hinge forward with soft elbows", "Move your arms out wide, not back"],
  ["reverse-pec-deck", "Reverse pec deck", "shoulders", "machine", "Handles at shoulder height", "Push out wide and pause"],
  ["face-pull", "Face pull", "shoulders", "cable", "Rope at face height", "Pull toward your forehead, elbows high"],
  // Biceps
  ["barbell-curl", "Barbell curl", "biceps", "barbell", "Elbows pinned to your sides", "No swinging"],
  ["ez-bar-curl", "EZ-bar curl", "biceps", "ez-bar", "Grip the angled part of the bar", "Elbows stay still"],
  ["db-curl", "Dumbbell curl", "biceps", "dumbbell", "Turn palms up as you lift", "Lower under control"],
  ["hammer-curl", "Hammer curl", "biceps", "dumbbell", "Palms face each other", "Elbows stay still"],
  ["incline-db-curl", "Incline dumbbell curl", "biceps", "dumbbell", "Bench at about 45°", "Let your arms hang straight down"],
  ["preacher-curl", "Preacher curl", "biceps", "ez-bar", "Armpits snug on the pad", "Don't fully relax at the bottom"],
  ["cable-curl", "Cable curl", "biceps", "cable", "Elbows by your sides", "Squeeze at the top"],
  // Triceps
  ["close-grip-bench", "Close-grip bench press", "triceps", "barbell", "Hands about shoulder-width", "Elbows tucked to your sides"],
  ["triceps-pushdown", "Triceps pushdown", "triceps", "cable", "Elbows pinned to your sides", "Spread the rope at the bottom"],
  ["overhead-triceps-extension", "Overhead cable triceps extension", "triceps", "cable", "Face away from the cable", "Reach a full stretch behind your head"],
  ["skull-crusher", "Skull crusher", "triceps", "ez-bar", "Lower the bar toward your forehead", "Elbows point at the ceiling"],
  ["db-overhead-extension", "Dumbbell overhead extension", "triceps", "dumbbell", "Hold one dumbbell with both hands", "Elbows close to your head"],
  ["triceps-dip", "Triceps dip", "triceps", "bodyweight", "Body upright", "Lower to about 90° at the elbow"],
  // Quads
  ["back-squat", "Barbell back squat", "quads", "barbell", "Brace, then sit down between your hips", "Knees track over your toes"],
  ["front-squat", "Front squat", "quads", "barbell", "Elbows high", "Stay upright through the lift"],
  ["hack-squat", "Hack squat", "quads", "machine", "Feet shoulder-width, mid-platform", "Go as deep as you can control"],
  ["leg-press", "Leg press", "quads", "machine", "Lower back stays on the pad", "Don't lock your knees at the top"],
  ["smith-squat", "Smith machine squat", "quads", "smith", "Feet slightly in front of the bar", "Control the lowering"],
  ["leg-extension", "Leg extension", "quads", "machine", "Pad just above the ankles", "Squeeze at the top"],
  ["goblet-squat", "Goblet squat", "quads", "dumbbell", "Hold the weight at your chest", "Elbows inside the knees at the bottom"],
  ["bulgarian-split-squat", "Bulgarian split squat", "quads", "dumbbell", "Rear foot on a bench", "Front knee tracks over the toes"],
  ["walking-lunge", "Walking lunge", "quads", "dumbbell", "Long stride, upright torso", "Back knee nearly touches the floor"],
  // Hamstrings
  ["romanian-deadlift", "Romanian deadlift", "hamstrings", "barbell", "Soft knees, push your hips back", "Bar stays close to your legs"],
  ["db-romanian-deadlift", "Dumbbell Romanian deadlift", "hamstrings", "dumbbell", "Soft knees, push your hips back", "Dumbbells stay close to your legs"],
  ["lying-leg-curl", "Lying leg curl", "hamstrings", "machine", "Hips pressed into the pad", "Slow on the way down"],
  ["seated-leg-curl", "Seated leg curl", "hamstrings", "machine", "Pad just above the ankles", "Squeeze at the bottom"],
  ["good-morning", "Good morning", "hamstrings", "barbell", "Bar on your upper back", "Hinge until you feel a hamstring stretch"],
  ["nordic-curl", "Nordic hamstring curl", "hamstrings", "bodyweight", "Lower yourself slowly", "Keep your hips straight"],
  // Glutes
  ["hip-thrust", "Barbell hip thrust", "glutes", "barbell", "Upper back on the bench edge", "Chin tucked, squeeze at the top"],
  ["glute-bridge", "Glute bridge", "glutes", "bodyweight", "Feet flat, close to your glutes", "Drive through your heels"],
  ["cable-kickback", "Cable glute kickback", "glutes", "cable", "Slight forward lean", "Kick back without arching your lower back"],
  ["hip-abduction", "Hip abduction machine", "glutes", "machine", "Sit tall or lean slightly forward", "Pause at the widest point"],
  ["sumo-deadlift", "Sumo deadlift", "glutes", "barbell", "Wide stance, toes out", "Push your knees out as you stand"],
  ["kettlebell-swing", "Kettlebell swing", "glutes", "kettlebell", "Hinge, don't squat", "Snap your hips forward"],
  // Calves
  ["standing-calf-raise", "Standing calf raise", "calves", "machine", "Full stretch at the bottom", "Pause at the top"],
  ["seated-calf-raise", "Seated calf raise", "calves", "machine", "Pad on your lower thighs", "Slow and full range"],
  ["leg-press-calf-raise", "Leg press calf raise", "calves", "machine", "Balls of your feet on the platform edge", "Knees straight but not locked"],
  // Core
  ["cable-crunch", "Cable crunch", "core", "cable", "Kneel with the rope by your head", "Curl your ribs toward your hips"],
  ["machine-crunch", "Ab crunch machine", "core", "machine", "Curl, don't pull with your arms", "Slow on the way back"],
  ["hanging-leg-raise", "Hanging leg raise", "core", "bodyweight", "No swinging", "Curl your hips up, not just your legs"],
  ["ab-wheel", "Ab wheel rollout", "core", "bodyweight", "Ribs down, glutes tight", "Roll out only as far as you control"],
  ["crunch", "Crunch", "core", "bodyweight", "Hands lightly by your head", "Curl your shoulders off the floor"],
  ["russian-twist", "Russian twist", "core", "bodyweight", "Lean back slightly, chest up", "Rotate from your torso"],
  ["pallof-press", "Pallof press", "core", "cable", "Stand side-on to the cable", "Press out and resist the turn"],
  ["dead-bug", "Dead bug", "core", "bodyweight", "Lower back pressed to the floor", "Move opposite arm and leg slowly"],
];

/** Optional demo videos for built-in exercises, by id (https links). */
const VIDEOS: Partial<Record<string, string>> = {};

export const LIBRARY: readonly Exercise[] = ROWS.map(([id, name, muscle, equipment, cue1, cue2]) => ({
  id,
  name,
  muscle,
  equipment,
  cues: [cue1, cue2],
  bodyweight: equipment === "bodyweight",
  video: VIDEOS[id] ?? null,
  custom: false,
}));

const BY_ID = new Map(LIBRARY.map((e) => [e.id, e]));

export function libraryExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

/** Where "Watch a demo" goes: the exercise's own video, or a YouTube search. */
export function demoUrl(e: Pick<Exercise, "name" | "video">): string {
  return e.video ?? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${e.name} proper form`)}`;
}
