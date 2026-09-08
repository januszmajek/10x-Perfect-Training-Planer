import { isCanonicalUuid, validateDraftItems, type ManualWorkoutDraftItem } from "./manual-workout-builder.ts";

export const PLANNED_WORKOUT_MUTATION_VERSION = 1 as const;

const UPDATE_KEYS = ["version", "expectedWorkoutId", "expectedRevision", "exercises"];
const DELETE_KEYS = ["version", "expectedWorkoutId", "expectedRevision"];
const COMPLETE_KEYS = ["version", "expectedWorkoutId", "expectedRevision"];
const EXERCISE_KEYS = ["exerciseId", "sets", "reps"];

export interface PlannedWorkoutUpdateRequest {
  version: typeof PLANNED_WORKOUT_MUTATION_VERSION;
  expectedWorkoutId: string;
  expectedRevision: number;
  exercises: ManualWorkoutDraftItem[];
}

export interface PlannedWorkoutDeleteRequest {
  version: typeof PLANNED_WORKOUT_MUTATION_VERSION;
  expectedWorkoutId: string;
  expectedRevision: number;
}

export interface PlannedWorkoutCompleteRequest {
  version: typeof PLANNED_WORKOUT_MUTATION_VERSION;
  expectedWorkoutId: string;
  expectedRevision: number;
}

export type PlannedWorkoutUpdateValidation = { valid: true; value: PlannedWorkoutUpdateRequest } | { valid: false };
export type PlannedWorkoutDeleteValidation = { valid: true; value: PlannedWorkoutDeleteRequest } | { valid: false };
export type PlannedWorkoutCompleteValidation = { valid: true; value: PlannedWorkoutCompleteRequest } | { valid: false };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

interface PlannedWorkoutMutationToken {
  version: typeof PLANNED_WORKOUT_MUTATION_VERSION;
  expectedWorkoutId: string;
  expectedRevision: number;
}

function parseValidToken(value: Record<string, unknown>): PlannedWorkoutMutationToken | null {
  if (
    value.version === PLANNED_WORKOUT_MUTATION_VERSION &&
    isCanonicalUuid(value.expectedWorkoutId) &&
    typeof value.expectedRevision === "number" &&
    Number.isSafeInteger(value.expectedRevision) &&
    value.expectedRevision > 0
  ) {
    return {
      version: PLANNED_WORKOUT_MUTATION_VERSION,
      expectedWorkoutId: value.expectedWorkoutId,
      expectedRevision: value.expectedRevision,
    };
  }
  return null;
}

export function parsePlannedWorkoutUpdateRequest(input: unknown): PlannedWorkoutUpdateValidation {
  if (!isPlainRecord(input) || !hasExactKeys(input, UPDATE_KEYS) || !Array.isArray(input.exercises)) {
    return { valid: false };
  }
  const token = parseValidToken(input);
  if (!token) return { valid: false };

  const exercises: ManualWorkoutDraftItem[] = [];
  for (const item of input.exercises) {
    if (!isPlainRecord(item) || !hasExactKeys(item, EXERCISE_KEYS)) return { valid: false };
    exercises.push({ exerciseId: item.exerciseId as string, sets: item.sets as number, reps: item.reps as number });
  }

  if (!validateDraftItems(exercises)) return { valid: false };

  return {
    valid: true,
    value: {
      version: PLANNED_WORKOUT_MUTATION_VERSION,
      expectedWorkoutId: token.expectedWorkoutId,
      expectedRevision: token.expectedRevision,
      exercises,
    },
  };
}

export function parsePlannedWorkoutDeleteRequest(input: unknown): PlannedWorkoutDeleteValidation {
  if (!isPlainRecord(input) || !hasExactKeys(input, DELETE_KEYS)) return { valid: false };
  const token = parseValidToken(input);
  if (!token) return { valid: false };

  return {
    valid: true,
    value: {
      version: PLANNED_WORKOUT_MUTATION_VERSION,
      expectedWorkoutId: token.expectedWorkoutId,
      expectedRevision: token.expectedRevision,
    },
  };
}

export function parsePlannedWorkoutCompleteRequest(input: unknown): PlannedWorkoutCompleteValidation {
  if (!isPlainRecord(input) || !hasExactKeys(input, COMPLETE_KEYS)) return { valid: false };
  const token = parseValidToken(input);
  if (!token) return { valid: false };

  return {
    valid: true,
    value: {
      version: PLANNED_WORKOUT_MUTATION_VERSION,
      expectedWorkoutId: token.expectedWorkoutId,
      expectedRevision: token.expectedRevision,
    },
  };
}
