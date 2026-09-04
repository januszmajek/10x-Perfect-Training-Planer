import type { Enums } from "../types/database.types.ts";
import { matchesAllSelectedMuscles } from "./muscle-filter.ts";

export const MANUAL_WORKOUT_REQUEST_VERSION = 1 as const;
export const MAX_WORKOUT_EXERCISES = 20;
export const MIN_SETS = 1;
export const MAX_SETS = 99;
export const MIN_REPS = 1;
export const MAX_REPS = 999;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REQUEST_KEYS = ["exercises", "expectedRevision", "expectedWorkoutId", "replaceExisting", "version"];
const EXERCISE_KEYS = ["exerciseId", "reps", "sets"];

export type EquipmentType = Enums<"equipment_type">;
export type MuscleRole = Enums<"exercise_muscle_role">;

export interface CatalogueMuscleTag {
  code: string;
  name: string;
  role: MuscleRole;
  recoveryHours: number;
}

export interface CatalogueExercise {
  id: string;
  name: string;
  equipment: EquipmentType;
  muscles: CatalogueMuscleTag[];
}

export interface ManualWorkoutDraftItem {
  exerciseId: string;
  sets: number;
  reps: number;
}

export interface OrderedPlannedWorkoutExercise {
  exerciseId: string;
  position: number;
  sets: number;
  reps: number;
}

export interface CatalogueFilters {
  search: string;
  muscleGroups: readonly string[];
  equipment: readonly EquipmentType[];
}

export interface ManualWorkoutRequest {
  version: typeof MANUAL_WORKOUT_REQUEST_VERSION;
  replaceExisting: boolean;
  expectedWorkoutId: string | null;
  expectedRevision: number | null;
  exercises: ManualWorkoutDraftItem[];
}

export type ManualWorkoutRequestValidation = { valid: true; value: ManualWorkoutRequest } | { valid: false };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

export function isCanonicalUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function filterCatalogue<T extends CatalogueExercise>(catalogue: readonly T[], filters: CatalogueFilters): T[] {
  const search = filters.search.trim().toLocaleLowerCase();
  const selectedEquipment = new Set(filters.equipment);

  return catalogue.filter((exercise) => {
    const matchesName = search.length === 0 || exercise.name.toLocaleLowerCase().includes(search);
    const matchesMuscle = matchesAllSelectedMuscles(exercise.muscles, filters.muscleGroups);
    const matchesEquipment = selectedEquipment.size === 0 || selectedEquipment.has(exercise.equipment);

    return matchesName && matchesMuscle && matchesEquipment;
  });
}

export function createDraftItem(exerciseId: string): ManualWorkoutDraftItem {
  return { exerciseId, sets: 3, reps: 10 };
}

export function createDraftFromCurrentPlan(
  exercises: readonly OrderedPlannedWorkoutExercise[],
): ManualWorkoutDraftItem[] {
  return [...exercises]
    .sort((left, right) => left.position - right.position)
    .map(({ exerciseId, sets, reps }) => ({ exerciseId, sets, reps }));
}

export function addDraftItem(draft: readonly ManualWorkoutDraftItem[], exerciseId: string): ManualWorkoutDraftItem[] {
  if (draft.some((item) => item.exerciseId === exerciseId)) {
    return [...draft];
  }

  return [...draft, createDraftItem(exerciseId)];
}

export function removeDraftItem(
  draft: readonly ManualWorkoutDraftItem[],
  exerciseId: string,
): ManualWorkoutDraftItem[] {
  return draft.filter((item) => item.exerciseId !== exerciseId);
}

export function moveDraftItem(
  draft: readonly ManualWorkoutDraftItem[],
  index: number,
  direction: "up" | "down",
): ManualWorkoutDraftItem[] {
  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= draft.length ||
    targetIndex < 0 ||
    targetIndex >= draft.length
  ) {
    return [...draft];
  }

  const next = [...draft];
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}

export function replaceDraftItem(
  draft: readonly ManualWorkoutDraftItem[],
  index: number,
  exerciseId: string,
): ManualWorkoutDraftItem[] {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= draft.length ||
    !isCanonicalUuid(exerciseId) ||
    draft.some((item, itemIndex) => itemIndex !== index && item.exerciseId === exerciseId)
  ) {
    return [...draft];
  }

  return draft.map((item, itemIndex) => (itemIndex === index ? { ...item, exerciseId } : item));
}

export function areDraftsEqual(
  left: readonly ManualWorkoutDraftItem[],
  right: readonly ManualWorkoutDraftItem[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.exerciseId === right[index]?.exerciseId &&
        item.sets === right[index]?.sets &&
        item.reps === right[index]?.reps,
    )
  );
}

export function validateDraftItems(
  items: readonly ManualWorkoutDraftItem[],
  knownExerciseIds?: ReadonlySet<string>,
): boolean {
  if (items.length < 1 || items.length > MAX_WORKOUT_EXERCISES) {
    return false;
  }

  const exerciseIds = new Set<string>();

  for (const item of items) {
    if (
      !isCanonicalUuid(item.exerciseId) ||
      exerciseIds.has(item.exerciseId) ||
      (knownExerciseIds && !knownExerciseIds.has(item.exerciseId)) ||
      !Number.isSafeInteger(item.sets) ||
      item.sets < MIN_SETS ||
      item.sets > MAX_SETS ||
      !Number.isSafeInteger(item.reps) ||
      item.reps < MIN_REPS ||
      item.reps > MAX_REPS
    ) {
      return false;
    }

    exerciseIds.add(item.exerciseId);
  }

  return true;
}

export function parseManualWorkoutRequest(input: unknown): ManualWorkoutRequestValidation {
  if (!isPlainRecord(input) || !hasExactKeys(input, REQUEST_KEYS)) {
    return { valid: false };
  }

  if (
    input.version !== MANUAL_WORKOUT_REQUEST_VERSION ||
    typeof input.replaceExisting !== "boolean" ||
    (input.expectedWorkoutId !== null && !isCanonicalUuid(input.expectedWorkoutId)) ||
    (input.expectedRevision !== null &&
      (!Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 1)) ||
    !Array.isArray(input.exercises)
  ) {
    return { valid: false };
  }

  if (
    (input.replaceExisting && (input.expectedWorkoutId === null || input.expectedRevision === null)) ||
    (!input.replaceExisting && (input.expectedWorkoutId !== null || input.expectedRevision !== null))
  ) {
    return { valid: false };
  }

  const exercises: ManualWorkoutDraftItem[] = [];

  for (const item of input.exercises) {
    if (!isPlainRecord(item) || !hasExactKeys(item, EXERCISE_KEYS)) {
      return { valid: false };
    }

    exercises.push({
      exerciseId: item.exerciseId as string,
      sets: item.sets as number,
      reps: item.reps as number,
    });
  }

  if (!validateDraftItems(exercises)) {
    return { valid: false };
  }

  return {
    valid: true,
    value: {
      version: MANUAL_WORKOUT_REQUEST_VERSION,
      replaceExisting: input.replaceExisting,
      expectedWorkoutId: input.expectedWorkoutId,
      expectedRevision: input.expectedRevision,
      exercises,
    },
  };
}
