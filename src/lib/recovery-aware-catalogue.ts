import type { CatalogueExercise, CatalogueMuscleTag } from "./manual-workout-builder.ts";

export type RecoveryState = "ready" | "recovering";

export interface CompletedRecoveryWorkout {
  completedAt: string;
  exercises: { sets: number; muscles: CatalogueMuscleTag[] }[];
}

export interface RecoveryMuscleContext {
  code: string;
  name: string;
  recoveringUntil: string;
  remainingMilliseconds: number;
}

export interface SecondaryWorkloadContext {
  code: string;
  name: string;
  fractionalSets: number;
}

export interface RecoveryAwareCatalogueExercise extends CatalogueExercise {
  recovery: {
    state: RecoveryState;
    recoveringMuscles: RecoveryMuscleContext[];
    secondaryWorkload: SecondaryWorkloadContext[];
  };
}

function validDate(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function projectRecoveryAwareCatalogue(
  catalogue: readonly CatalogueExercise[],
  completedWorkouts: readonly CompletedRecoveryWorkout[],
  now: Date = new Date(),
): RecoveryAwareCatalogueExercise[] {
  const nowMilliseconds = now.getTime();
  const deadlines = new Map<string, number>();
  const secondarySets = new Map<string, number>();

  for (const workout of completedWorkouts) {
    const completedAt = validDate(workout.completedAt);
    if (completedAt === null) continue;

    for (const exercise of workout.exercises) {
      if (!Number.isSafeInteger(exercise.sets) || exercise.sets < 1) continue;
      for (const muscle of exercise.muscles) {
        if (muscle.role === "primary") {
          const deadline = completedAt + muscle.recoveryHours * 60 * 60 * 1000;
          deadlines.set(muscle.code, Math.max(deadlines.get(muscle.code) ?? 0, deadline));
        } else {
          secondarySets.set(muscle.code, (secondarySets.get(muscle.code) ?? 0) + exercise.sets * 0.5);
        }
      }
    }
  }

  return catalogue.map((exercise) => {
    const recoveringMuscles = exercise.muscles.flatMap((muscle) => {
      const deadline = deadlines.get(muscle.code);
      if (muscle.role !== "primary" || !deadline || nowMilliseconds >= deadline) return [];
      return [
        {
          code: muscle.code,
          name: muscle.name,
          recoveringUntil: new Date(deadline).toISOString(),
          remainingMilliseconds: deadline - nowMilliseconds,
        },
      ];
    });
    const secondaryWorkload = exercise.muscles.flatMap((muscle) => {
      const fractionalSets = secondarySets.get(muscle.code);
      return muscle.role === "secondary" && fractionalSets
        ? [{ code: muscle.code, name: muscle.name, fractionalSets }]
        : [];
    });

    return {
      ...exercise,
      recovery: {
        state: recoveringMuscles.length ? "recovering" : "ready",
        recoveringMuscles,
        secondaryWorkload,
      },
    };
  });
}
