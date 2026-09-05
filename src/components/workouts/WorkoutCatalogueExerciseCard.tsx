import { Check, Plus } from "lucide-react";
import type { CatalogueExercise } from "@/lib/manual-workout-builder";
import type { RecoveryAwareCatalogueExercise } from "@/lib/recovery-aware-catalogue";

interface Props {
  exercise: CatalogueExercise;
  recovery: RecoveryAwareCatalogueExercise["recovery"] | null;
  pending: boolean;
  disabled: boolean;
  actionLabel: "Add" | "Added" | "Replace" | "Current";
  onSelect: () => void;
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatRemainingTime(milliseconds: number): string {
  const hours = Math.ceil(milliseconds / (60 * 60 * 1000));
  return hours <= 1 ? "1h" : `${hours}h`;
}

function formatRecoveryDuration(milliseconds: number): string {
  const hours = Math.max(1, Math.ceil(milliseconds / (60 * 60 * 1000)));
  return `${hours} hour${hours === 1 ? "" : "s"} of recovery time remaining`;
}

export default function WorkoutCatalogueExerciseCard({
  exercise,
  recovery,
  pending,
  disabled,
  actionLabel,
  onSelect,
}: Props) {
  const recoveringMuscles = new Map(recovery?.recoveringMuscles.map((muscle) => [muscle.code, muscle]));
  const isRecovering = recovery?.state === "recovering";
  const border = isRecovering ? "border-amber-300/30" : "border-white/10";

  return (
    <li className={`rounded-xl border ${border} bg-black/15 p-4`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <h3 className="font-semibold wrap-break-word text-white">{exercise.name}</h3>
          <p className="mt-1 text-xs text-purple-200 uppercase">{formatLabel(exercise.equipment)}</p>
          {exercise.muscles.length > 0 && (
            <ul className="mt-3 flex w-full flex-wrap gap-2" aria-label={`${exercise.name} muscle groups`}>
              {exercise.muscles.map((muscle) => {
                const recoveryContext = muscle.role === "primary" ? recoveringMuscles.get(muscle.code) : undefined;
                return (
                  <li
                    key={`${muscle.code}-${muscle.role}`}
                    className={`rounded-full px-2.5 py-1 text-xs ${recoveryContext ? "bg-amber-400/15 text-amber-100" : "bg-purple-500/15 text-purple-100"}`}
                  >
                    {muscle.name}
                    {recoveryContext && (
                      <>
                        <span aria-hidden="true"> {formatRemainingTime(recoveryContext.remainingMilliseconds)}</span>
                        <span className="sr-only">
                          {" "}
                          {formatRecoveryDuration(recoveryContext.remainingMilliseconds)}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <button
          type="button"
          disabled={pending || disabled}
          onClick={onSelect}
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-purple-300/30 px-3 py-2 text-sm font-semibold text-purple-100 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
        >
          {actionLabel === "Current" ? (
            <Check aria-hidden="true" className="size-4" />
          ) : (
            <Plus aria-hidden="true" className="size-4" />
          )}
          {actionLabel}
        </button>
      </div>
    </li>
  );
}
