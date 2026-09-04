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

export default function WorkoutCatalogueExerciseCard({
  exercise,
  recovery,
  pending,
  disabled,
  actionLabel,
  onSelect,
}: Props) {
  const recoveringMuscles = new Set(recovery?.recoveringMuscles.map(({ code }) => code));
  const isRecovering = recovery?.state === "recovering";
  const border = recovery ? (isRecovering ? "border-amber-300/30" : "border-emerald-300/25") : "border-white/10";

  return (
    <li className={`rounded-xl border ${border} bg-black/15 p-4`}>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-semibold wrap-break-word text-white">{exercise.name}</h3>
          <p className="mt-1 text-xs text-purple-200 uppercase">{formatLabel(exercise.equipment)}</p>
          {recovery && (
            <p className={`mt-3 text-sm ${isRecovering ? "text-amber-100" : "text-emerald-100"}`}>
              {isRecovering
                ? `Recovery: ${recovery.recoveringMuscles.map((muscle) => `${muscle.name} · ${formatRemainingTime(muscle.remainingMilliseconds)} left`).join(", ")}`
                : "Ready to train"}
            </p>
          )}
          {exercise.muscles.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${exercise.name} muscle groups`}>
              {exercise.muscles.map((muscle) => (
                <li
                  key={`${muscle.code}-${muscle.role}`}
                  className={`rounded-full px-2.5 py-1 text-xs ${muscle.role === "primary" && recoveringMuscles.has(muscle.code) ? "bg-amber-400/15 text-amber-100" : "bg-purple-500/15 text-purple-100"}`}
                >
                  {muscle.name}
                </li>
              ))}
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
