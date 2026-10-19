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
 *
 * `aka` holds other names an exercise goes by, so searching "overhead press
 * machine" finds Machine shoulder press.
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
  /** Other names it goes by, matched by search. */
  aka?: string;
  /** Done one arm or leg at a time: sets are logged per side. */
  oneSide?: boolean;
  /** A built-in exercise whose drawings it shares (its two-sided version, or a close one). */
  artOf?: string;
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
  ["incline-machine-press", "Incline machine chest press", "chest", "machine", "Seat so the handles line up with your upper chest", "Shoulder blades back on the pad, press up and out"],
  ["smith-bench-press", "Smith machine bench press", "chest", "smith", "Set the bench so the bar meets mid-chest", "Shoulder blades pinched, control the lowering"],
  ["smith-incline-press", "Smith machine incline bench press", "chest", "smith", "Set the bench so the bar meets upper chest", "Control the lowering"],
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
  ["cable-lat-pullover", "Cable lat pullover", "back", "cable", "Soft bend in the elbows, start from a full stretch overhead", "Pull with the lats down toward your hips, ribs stay down"],
  ["rack-pull", "Rack pull", "back", "barbell", "Bar starts just below the knees", "Lock out with the hips, don't lean back"],
  ["smith-deadlift", "Smith machine deadlift", "back", "smith", "Bar over mid-foot, back flat", "Stand up tall, lower under control"],
  ["back-extension", "Back extension", "back", "bodyweight", "Hinge at the hips", "Stop when your body is in a straight line"],
  ["db-shrug", "Dumbbell shrug", "back", "dumbbell", "Shoulders straight up toward your ears", "Pause at the top, no rolling"],
  // Shoulders
  ["overhead-press", "Overhead press", "shoulders", "barbell", "Squeeze glutes, ribs down", "Press straight up, head through at the top"],
  ["db-shoulder-press", "Seated dumbbell shoulder press", "shoulders", "dumbbell", "Back against the pad", "Lower to ear level"],
  ["machine-shoulder-press", "Machine shoulder press", "shoulders", "machine", "Handles at shoulder height to start", "Press without shrugging"],
  ["arnold-press", "Arnold press", "shoulders", "dumbbell", "Start with palms facing you", "Rotate the palms out as you press"],
  ["lateral-raise", "Dumbbell lateral raise", "shoulders", "dumbbell", "Lead with the elbows", "Raise to shoulder height, no swinging"],
  ["cable-lateral-raise", "Cable lateral raise", "shoulders", "cable", "Stand side-on to a low pulley", "Slow on the way down"],
  ["machine-lateral-raise", "Machine lateral raise", "shoulders", "machine", "Pads just above the elbows", "Raise to shoulder height, slow on the way down"],
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
  ["triceps-dip-machine", "Triceps dip machine", "triceps", "machine", "Sit tall, elbows pointing back", "Press down to straight arms, slow on the way up"],
  ["machine-triceps-extension", "Machine triceps extension", "triceps", "machine", "Elbows on the pad, in line with the machine's pivot", "Straighten fully, slow on the way back"],
  // Quads
  ["back-squat", "Barbell back squat", "quads", "barbell", "Brace, then sit down between your hips", "Knees track over your toes"],
  ["front-squat", "Front squat", "quads", "barbell", "Elbows high", "Stay upright through the lift"],
  ["hack-squat", "Hack squat", "quads", "machine", "Feet shoulder-width, mid-platform", "Go as deep as you can control"],
  ["pendulum-squat", "Pendulum squat", "quads", "machine", "Back flat on the pad, feet mid-platform", "Sink deep, drive through the whole foot"],
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
  ["hip-adduction", "Hip adduction machine", "glutes", "machine", "Sit tall, back against the pad", "Squeeze the knees together and pause"],
  ["machine-reverse-v-squat", "Machine reverse V-squat", "glutes", "machine", "Face the machine, chest on the pad, shoulders under the pads", "Sit back and down, drive through your heels"],
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

/** Built-in exercises with no drawing of their own, shown with a close one's. */
const ART_OF: Partial<Record<string, string>> = {
  "machine-reverse-v-squat": "hack-squat",
  "cable-lat-pullover": "straight-arm-pulldown",
};

/** Optional demo videos for built-in exercises, by id (https links). */
const VIDEOS: Partial<Record<string, string>> = {};

/** Other names built-in exercises go by, for search. */
const ALIASES: Partial<Record<string, string>> = {
  "machine-shoulder-press": "overhead press machine",
  "chest-supported-row": "chest supported row machine",
  "t-bar-row": "tbar",
  "smith-incline-press": "incline smith press",
  "incline-machine-press": "incline press machine",
  "machine-reverse-v-squat": "reverse v squat vsquat facing in",
  "cable-lat-pullover": "rope pullover lying kneeling",
  "machine-triceps-extension": "triceps extension machine seated",
  "triceps-dip-machine": "seated dip machine",
  "leg-press-calf-raise": "calf press",
};

/**
 * One-arm and one-leg versions of library exercises, kept as exercises of
 * their own so their weights don't mix with the two-sided version's, and the
 * only exercises logged one side at a time. Each sits after its two-sided
 * version (`base`) and shares its drawings, unless `art` says it has its own.
 */
type OneSideRow = [id: string, name: string, muscle: Muscle, equipment: Equipment, cue1: string, cue2: string, base: string, aka: string, art?: boolean];

const ONE_SIDE_ROWS: OneSideRow[] = [
  ["single-arm-lat-pulldown", "Single-arm lat pulldown", "back", "cable", "Let the shoulder stretch up at the top", "Drive the elbow down to your hip", "lat-pulldown", "one arm unilateral"],
  ["single-arm-cable-row", "Single-arm seated cable row", "back", "cable", "Sit tall, no twisting", "Pull your elbow back past your ribs", "seated-cable-row", "one arm unilateral"],
  ["single-arm-cable-curl", "Single-arm cable curl", "biceps", "cable", "Elbow by your side", "Squeeze at the top", "cable-curl", "one arm unilateral"],
  ["single-arm-cable-hammer-curl", "Single-arm cable hammer curl", "biceps", "cable", "Palm faces in, elbow by your side", "Curl up without turning the wrist", "cable-curl", "one arm unilateral hammer", true],
  ["single-arm-incline-db-curl", "Single-arm incline dumbbell curl", "biceps", "dumbbell", "Bench at about 45°, working arm hangs straight down", "Curl without moving the elbow forward", "incline-db-curl", "one arm unilateral", true],
  ["single-arm-preacher-curl", "Single-arm dumbbell preacher curl", "biceps", "dumbbell", "Back of the arm flat on the pad", "Lower all the way, don't fully relax at the bottom", "preacher-curl", "one arm unilateral", true],
  ["single-arm-triceps-pushdown", "Single-arm cable triceps pushdown", "triceps", "cable", "Elbow pinned to your side", "Straighten fully, slow on the way up", "triceps-pushdown", "one arm unilateral pressdown"],
  ["single-arm-machine-lateral-raise", "Single-arm machine lateral raise", "shoulders", "machine", "Pad just above the elbow", "Raise to shoulder height, slow on the way down", "machine-lateral-raise", "one arm unilateral side raise"],
  ["single-arm-overhead-triceps-extension", "Single-arm overhead cable triceps extension", "triceps", "cable", "Elbow points up and stays still", "Full stretch behind your head", "overhead-triceps-extension", "one arm unilateral"],
  ["single-leg-pendulum-squat", "Single-leg pendulum squat", "quads", "machine", "Working foot mid-platform, the other off", "Control the depth, drive through the whole foot", "pendulum-squat", "one leg unilateral"],
  ["single-leg-extension", "Single-leg leg extension", "quads", "machine", "Pad just above the ankle", "Squeeze at the top", "leg-extension", "one leg unilateral"],
  ["single-leg-curl", "Single-leg seated leg curl", "hamstrings", "machine", "Pad just above the ankle", "Squeeze at the bottom", "seated-leg-curl", "one leg unilateral"],
];

const TWO_SIDED: readonly Exercise[] = ROWS.map(([id, name, muscle, equipment, cue1, cue2]) => ({
  id,
  name,
  muscle,
  equipment,
  cues: [cue1, cue2],
  bodyweight: equipment === "bodyweight",
  video: VIDEOS[id] ?? null,
  aka: ALIASES[id],
  custom: false,
  artOf: ART_OF[id],
}));

/** Each one-sided version sits right after the exercise it's a version of. */
export const LIBRARY: readonly Exercise[] = TWO_SIDED.flatMap((e) => [
  e,
  ...ONE_SIDE_ROWS.filter((r) => r[6] === e.id).map(
    ([id, name, muscle, equipment, cue1, cue2, base, aka, art]): Exercise => ({
      id,
      name,
      muscle,
      equipment,
      cues: [cue1, cue2],
      bodyweight: false,
      video: null,
      aka,
      custom: false,
      oneSide: true,
      artOf: art ? undefined : base,
    }),
  ),
]);

const BY_ID = new Map(LIBRARY.map((e) => [e.id, e]));

export function libraryExercise(id: string): Exercise | undefined {
  return BY_ID.get(id);
}

/** Where "Watch a demo" goes: the exercise's own video, or a YouTube search. */
export function demoUrl(e: Pick<Exercise, "name" | "video">): string {
  return e.video ?? `https://www.youtube.com/results?search_query=${encodeURIComponent(`${e.name} proper form`)}`;
}
