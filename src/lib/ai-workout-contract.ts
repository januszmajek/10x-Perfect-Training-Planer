import {
  MAX_REPS,
  MAX_SETS,
  validateDraftItems,
  type CatalogueExercise,
  type ManualWorkoutDraftItem,
} from "./manual-workout-builder.ts";

export const MIN_AI_WORKOUT_EXERCISES = 5;
export const MAX_AI_WORKOUT_EXERCISES = 7;

export interface AiWorkoutProposal {
  exercises: ManualWorkoutDraftItem[];
}

export type AiWorkoutProposalFailure = "malformed_json" | "invalid_proposal";
export type AiWorkoutProposalResult =
  | { ok: true; data: AiWorkoutProposal }
  | { ok: false; code: AiWorkoutProposalFailure };

export const AI_WORKOUT_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["exercises"],
  properties: {
    exercises: {
      type: "array",
      minItems: MIN_AI_WORKOUT_EXERCISES,
      maxItems: MAX_AI_WORKOUT_EXERCISES,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["exerciseId", "sets", "reps"],
        properties: {
          exerciseId: { type: "string", format: "uuid" },
          sets: { type: "integer", minimum: 1, maximum: MAX_SETS },
          reps: { type: "integer", minimum: 1, maximum: MAX_REPS },
        },
      },
    },
  },
} as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function hasPrimaryCategory(exercise: CatalogueExercise, category: "lower_body" | "core"): boolean {
  return exercise.muscles.some((muscle) => muscle.role === "primary" && muscle.category === category);
}

function hasUpperBodyMovement(exercise: CatalogueExercise, movementPattern: "push" | "pull"): boolean {
  return (
    exercise.movementPattern === movementPattern &&
    exercise.muscles.some((muscle) => muscle.role === "primary" && muscle.category === "upper_body")
  );
}

export function parseAiWorkoutProposal(
  input: unknown,
  catalogue: readonly CatalogueExercise[],
): AiWorkoutProposalResult {
  if (!isPlainRecord(input) || !hasExactKeys(input, ["exercises"]) || !Array.isArray(input.exercises)) {
    return { ok: false, code: "invalid_proposal" };
  }

  const exercises: ManualWorkoutDraftItem[] = [];
  for (const item of input.exercises) {
    if (!isPlainRecord(item) || !hasExactKeys(item, ["exerciseId", "sets", "reps"])) {
      return { ok: false, code: "invalid_proposal" };
    }
    exercises.push({ exerciseId: item.exerciseId as string, sets: item.sets as number, reps: item.reps as number });
  }

  if (
    exercises.length < MIN_AI_WORKOUT_EXERCISES ||
    exercises.length > MAX_AI_WORKOUT_EXERCISES ||
    !validateDraftItems(exercises, new Set(catalogue.map(({ id }) => id)))
  ) {
    return { ok: false, code: "invalid_proposal" };
  }

  const selectedExercises = exercises.map((item) => catalogue.find(({ id }) => id === item.exerciseId));
  if (
    selectedExercises.some((exercise) => !exercise) ||
    !selectedExercises.some((exercise) => exercise && hasPrimaryCategory(exercise, "lower_body")) ||
    !selectedExercises.some((exercise) => exercise && hasPrimaryCategory(exercise, "core")) ||
    !selectedExercises.some((exercise) => exercise && hasUpperBodyMovement(exercise, "push")) ||
    !selectedExercises.some((exercise) => exercise && hasUpperBodyMovement(exercise, "pull"))
  ) {
    return { ok: false, code: "invalid_proposal" };
  }

  return { ok: true, data: { exercises } };
}

export function parseAiWorkoutProposalJson(
  content: string,
  catalogue: readonly CatalogueExercise[],
): AiWorkoutProposalResult {
  try {
    return parseAiWorkoutProposal(JSON.parse(content), catalogue);
  } catch {
    return { ok: false, code: "malformed_json" };
  }
}
