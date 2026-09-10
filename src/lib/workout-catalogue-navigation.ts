import type { CatalogueExercise, EquipmentType } from "@/lib/manual-workout-builder";
import { type RecoveryOrder } from "@/lib/recovery-aware-catalogue";

const SEARCH_KEY = "search";
const MUSCLE_KEY = "muscle";
const EQUIPMENT_KEY = "equipment";
const RECOVERY_ORDER_KEY = "recoveryOrder";
const MAX_SEARCH_LENGTH = 100;
const RECOGNIZED_KEYS = [SEARCH_KEY, MUSCLE_KEY, EQUIPMENT_KEY, RECOVERY_ORDER_KEY];

export interface WorkoutCatalogueNavigationState {
  search: string;
  muscles: string[];
  equipment: EquipmentType[];
  recoveryOrder: RecoveryOrder;
}

export const DEFAULT_WORKOUT_CATALOGUE_NAVIGATION: WorkoutCatalogueNavigationState = {
  search: "",
  muscles: [],
  equipment: [],
  recoveryOrder: "not-sorted",
};

function isRecoveryOrder(value: string | null): value is RecoveryOrder {
  return value === "not-sorted" || value === "ready-first" || value === "recovering-first";
}

function distinctKnown(values: readonly string[], known: ReadonlySet<string>): string[] {
  return [...new Set(values.filter((value) => known.has(value)))].sort((left, right) => left.localeCompare(right));
}

function normalizeSearch(value: string | null): string {
  return (value ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
}

export function parseWorkoutCatalogueNavigation(
  params: URLSearchParams,
  catalogue: readonly CatalogueExercise[],
): WorkoutCatalogueNavigationState {
  const knownMuscles = new Set(catalogue.flatMap((exercise) => exercise.muscles.map(({ code }) => code)));
  const knownEquipment = new Set<EquipmentType>(catalogue.map(({ equipment }) => equipment));
  const recoveryOrder = params.get(RECOVERY_ORDER_KEY);

  return {
    search: normalizeSearch(params.get(SEARCH_KEY)),
    muscles: distinctKnown(params.getAll(MUSCLE_KEY), knownMuscles),
    equipment: distinctKnown(params.getAll(EQUIPMENT_KEY), knownEquipment) as EquipmentType[],
    recoveryOrder: isRecoveryOrder(recoveryOrder) ? recoveryOrder : "not-sorted",
  };
}

export function toWorkoutCatalogueNavigationUrl(
  pathname: string,
  currentParams: URLSearchParams,
  state: WorkoutCatalogueNavigationState,
  catalogue: readonly CatalogueExercise[],
): string {
  const params = new URLSearchParams(currentParams);
  RECOGNIZED_KEYS.forEach((key) => {
    params.delete(key);
  });

  const normalized = parseWorkoutCatalogueNavigation(
    new URLSearchParams([
      ...(state.search ? [[SEARCH_KEY, state.search]] : []),
      ...state.muscles.map((muscle) => [MUSCLE_KEY, muscle]),
      ...state.equipment.map((equipment) => [EQUIPMENT_KEY, equipment]),
      ...(state.recoveryOrder === "not-sorted" ? [] : [[RECOVERY_ORDER_KEY, state.recoveryOrder]]),
    ]),
    catalogue,
  );

  if (normalized.search) params.set(SEARCH_KEY, normalized.search);
  normalized.muscles.forEach((muscle) => {
    params.append(MUSCLE_KEY, muscle);
  });
  normalized.equipment.forEach((equipment) => {
    params.append(EQUIPMENT_KEY, equipment);
  });
  if (normalized.recoveryOrder !== "not-sorted") params.set(RECOVERY_ORDER_KEY, normalized.recoveryOrder);

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
