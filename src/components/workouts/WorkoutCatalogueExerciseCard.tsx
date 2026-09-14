import { Check, Heart, Plus, ThumbsDown } from "lucide-react";
import type { AiWorkoutPreferenceState } from "@/lib/ai-workout-feedback-client";
import type { CatalogueExercise } from "@/lib/manual-workout-builder";
import type { RecoveryAwareCatalogueExercise } from "@/lib/recovery-aware-catalogue";

interface Props {
  exercise: CatalogueExercise;
  recovery: RecoveryAwareCatalogueExercise["recovery"] | null;
  pending: boolean;
  disabled: boolean;
  actionLabel: "Add" | "Added" | "Replace" | "Current";
  feedback?: {
    preference: AiWorkoutPreferenceState;
    pending: boolean;
    onPreferenceChange: (preference: Exclude<AiWorkoutPreferenceState, "neutral">) => void;
  };
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
  feedback,
  onSelect,
}: Props) {
  const recoveringMuscles = new Map(recovery?.recoveringMuscles.map((muscle) => [muscle.code, muscle]));
  const isRecovering = recovery?.state === "recovering";
  const border = isRecovering ? "border-amber-300/30" : "border-white/10";

  return (
    <li className={`rounded-xl border ${border} bg-black/15 p-4`}>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="w-full min-w-0">
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
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            disabled={pending || disabled}
            onClick={onSelect}
            aria-label={`${actionLabel} ${exercise.name}`}
            title={`${actionLabel} ${exercise.name}`}
            className="inline-flex size-10 items-center justify-center rounded-lg border border-white/20 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {actionLabel === "Current" ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <Plus aria-hidden="true" className="size-4" />
            )}
          </button>
          {feedback && (
            <div className="flex gap-1.5" role="group" aria-label={`Recommendation preference for ${exercise.name}`}>
              <button
                type="button"
                aria-label={`Like ${exercise.name}`}
                aria-pressed={feedback.preference === "liked"}
                title="Like for future AI proposals"
                disabled={pending || feedback.pending}
                onClick={() => {
                  feedback.onPreferenceChange("liked");
                }}
                className="inline-flex size-10 items-center justify-center rounded-lg border border-white/20 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Heart
                  aria-hidden="true"
                  className="size-4"
                  fill={feedback.preference === "liked" ? "currentColor" : "none"}
                />
              </button>
              <button
                type="button"
                aria-label={`Don't recommend ${exercise.name}`}
                aria-pressed={feedback.preference === "dont_suggest"}
                title="Don't recommend in future AI proposals"
                disabled={pending || feedback.pending}
                onClick={() => {
                  feedback.onPreferenceChange("dont_suggest");
                }}
                className="inline-flex size-10 items-center justify-center rounded-lg border border-white/20 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ThumbsDown
                  aria-hidden="true"
                  className="size-4"
                  fill={feedback.preference === "dont_suggest" ? "currentColor" : "none"}
                />
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
