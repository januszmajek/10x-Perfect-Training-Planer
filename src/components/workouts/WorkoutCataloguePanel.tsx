import { useMemo, type RefObject } from "react";
import { Dumbbell, SlidersHorizontal } from "lucide-react";
import WorkoutCatalogueExerciseCard from "@/components/workouts/WorkoutCatalogueExerciseCard";
import type { AiWorkoutFeedbackControls } from "@/lib/ai-workout-feedback-client";
import {
  MAX_WORKOUT_EXERCISES,
  type CatalogueExercise,
  type ManualWorkoutDraftItem,
} from "@/lib/manual-workout-builder";
import {
  RECOVERY_ORDER_LABELS,
  nextRecoveryOrder,
  orderRecoveryAwareCatalogue,
  type RecoveryAwareCatalogueExercise,
  type RecoveryOrder,
  type RecoveryState,
} from "@/lib/recovery-aware-catalogue";

interface Props {
  catalogue: CatalogueExercise[];
  filteredCatalogue: CatalogueExercise[];
  draft: ManualWorkoutDraftItem[];
  replacingIndex: number | null;
  pending: boolean;
  feedback?: AiWorkoutFeedbackControls;
  order: RecoveryOrder;
  filterTriggerRef: RefObject<HTMLButtonElement | null>;
  onOpenFilters: () => void;
  onOrderChange: (order: RecoveryOrder) => void;
  onSelectExercise: (exerciseId: string) => void;
}

const BUTTON_LABELS: Record<RecoveryOrder, string> = {
  "not-sorted": "Default",
  "ready-first": "Ready first",
  "recovering-first": "Recovery first",
};

function isRecoveryAware(exercise: CatalogueExercise): exercise is RecoveryAwareCatalogueExercise {
  return "recovery" in exercise;
}

export default function WorkoutCataloguePanel({
  catalogue,
  filteredCatalogue,
  draft,
  replacingIndex,
  pending,
  feedback,
  order,
  filterTriggerRef,
  onOpenFilters,
  onOrderChange,
  onSelectExercise,
}: Props) {
  const selectedIds = useMemo(() => new Set(draft.map(({ exerciseId }) => exerciseId)), [draft]);
  const recoveryAvailable = catalogue.length > 0 && catalogue.every(isRecoveryAware);
  const recoveryCatalogue = useMemo(() => filteredCatalogue.filter(isRecoveryAware), [filteredCatalogue]);
  const ordered = useMemo(() => orderRecoveryAwareCatalogue(recoveryCatalogue, order), [recoveryCatalogue, order]);
  const groups = useMemo<{ state: RecoveryState | null; exercises: CatalogueExercise[] }[]>(() => {
    if (!recoveryAvailable || order === "not-sorted") return [{ state: null, exercises: filteredCatalogue }];
    const states: RecoveryState[] = order === "ready-first" ? ["ready", "recovering"] : ["recovering", "ready"];
    return states
      .map((state) => ({ state, exercises: ordered.filter((exercise) => exercise.recovery.state === state) }))
      .filter(({ exercises }) => exercises.length > 0);
  }, [filteredCatalogue, order, ordered, recoveryAvailable]);

  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
      <h2 className="text-2xl font-bold text-white">Find exercises</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          ref={filterTriggerRef}
          type="button"
          onClick={onOpenFilters}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-blue-50 lg:hidden"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" /> Filters
        </button>
        {recoveryAvailable && (
          <button
            type="button"
            aria-label={`Recovery order: ${RECOVERY_ORDER_LABELS[order]}. Activate to show ${RECOVERY_ORDER_LABELS[nextRecoveryOrder(order)]}.`}
            onClick={() => {
              onOrderChange(nextRecoveryOrder(order));
            }}
            className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-blue-50 hover:bg-white/10"
          >
            Sort: {BUTTON_LABELS[order]}
          </button>
        )}
      </div>
      <p className="mt-3 text-sm text-blue-100/60" role="status">
        {filteredCatalogue.length} of {catalogue.length} exercises shown
      </p>
      <div className="mt-4 space-y-5" aria-label="Filtered exercise catalogue">
        {groups.map(({ state, exercises }) => (
          <div key={state ?? "all"}>
            {state && (
              <h3 className="mb-3 text-sm font-semibold tracking-wide text-emerald-200 uppercase">
                {state === "ready" ? "Ready to go" : "Muscles need recovery"}
              </h3>
            )}
            <ul className="space-y-3">
              {exercises.map((exercise) => {
                const selected = selectedIds.has(exercise.id);
                const replacing = replacingIndex !== null;
                const selectedElsewhere = selected && draft[replacingIndex ?? -1]?.exerciseId !== exercise.id;
                const current = replacing && draft[replacingIndex]?.exerciseId === exercise.id;
                const actionLabel = replacing ? (current ? "Current" : "Replace") : selected ? "Added" : "Add";
                return (
                  <WorkoutCatalogueExerciseCard
                    key={exercise.id}
                    exercise={exercise}
                    recovery={isRecoveryAware(exercise) ? exercise.recovery : null}
                    pending={pending}
                    disabled={
                      replacing ? selectedElsewhere || current : selected || draft.length >= MAX_WORKOUT_EXERCISES
                    }
                    actionLabel={actionLabel}
                    feedback={
                      feedback
                        ? {
                            preference: feedback.preferences[exercise.id] ?? "neutral",
                            pending: feedback.pendingExerciseId === exercise.id,
                            onPreferenceChange: (preference) => {
                              feedback.onPreferenceChange(exercise.id, preference);
                            },
                          }
                        : undefined
                    }
                    onSelect={() => {
                      onSelectExercise(exercise.id);
                    }}
                  />
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {filteredCatalogue.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
          <Dumbbell aria-hidden="true" className="mx-auto size-8 text-white/30" />
          <p className="mt-3 font-semibold text-white">No exercises match these filters</p>
        </div>
      )}
    </section>
  );
}
