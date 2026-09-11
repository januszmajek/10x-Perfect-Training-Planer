import { vi } from "vitest";
import type { CatalogueExercise, ManualWorkoutDraftItem } from "@/lib/manual-workout-builder";
import type { RecoveryAwareCatalogueExercise } from "@/lib/recovery-aware-catalogue";

export const EXERCISE_IDS = {
  benchPress: "00000000-0000-0000-0000-000000000001",
  cableRow: "00000000-0000-0000-0000-000000000002",
  squat: "00000000-0000-0000-0000-000000000003",
} as const;

export const catalogueExercises: CatalogueExercise[] = [
  {
    id: EXERCISE_IDS.benchPress,
    name: "Barbell Bench Press",
    equipment: "barbell",
    movementPattern: "push",
    muscles: [
      { code: "chest", name: "Chest", category: "upper_body", role: "primary", recoveryHours: 48 },
      { code: "triceps", name: "Triceps", category: "upper_body", role: "secondary", recoveryHours: 48 },
    ],
  },
  {
    id: EXERCISE_IDS.cableRow,
    name: "Cable Row",
    equipment: "cable",
    movementPattern: "pull",
    muscles: [
      { code: "upper_back", name: "Upper Back", category: "upper_body", role: "primary", recoveryHours: 72 },
      { code: "biceps", name: "Biceps", category: "upper_body", role: "secondary", recoveryHours: 48 },
    ],
  },
  {
    id: EXERCISE_IDS.squat,
    name: "Bodyweight Squat",
    equipment: "bodyweight",
    movementPattern: null,
    muscles: [{ code: "quads", name: "Quads", category: "lower_body", role: "primary", recoveryHours: 72 }],
  },
];

export const recoveryCatalogueExercises: RecoveryAwareCatalogueExercise[] = [
  {
    ...catalogueExercises[0],
    recovery: {
      state: "recovering",
      recoveringMuscles: [
        {
          code: "chest",
          name: "Chest",
          recoveringUntil: "2026-09-13T12:00:00.000Z",
          remainingMilliseconds: 48 * 60 * 60 * 1000,
        },
      ],
    },
  },
  {
    ...catalogueExercises[1],
    recovery: { state: "ready", recoveringMuscles: [] },
  },
  {
    ...catalogueExercises[2],
    recovery: { state: "ready", recoveringMuscles: [] },
  },
];

export const selectedDraft: ManualWorkoutDraftItem[] = [{ exerciseId: EXERCISE_IDS.benchPress, sets: 3, reps: 10 }];

export const catalogueCallbacks = () => ({
  onClose: vi.fn(),
  onOpenFilters: vi.fn(),
  onOrderChange: vi.fn(),
  onPreferenceChange: vi.fn(),
  onReset: vi.fn(),
  onSearchChange: vi.fn(),
  onSelectExercise: vi.fn(),
  onToggleEquipment: vi.fn(),
  onToggleMuscle: vi.fn(),
});
