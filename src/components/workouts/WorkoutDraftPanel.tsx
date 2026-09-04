import { ArrowDown, ArrowUp, Plus, Replace, Trash2, X } from "lucide-react";
import {
  MAX_REPS,
  MAX_SETS,
  MAX_WORKOUT_EXERCISES,
  MIN_REPS,
  MIN_SETS,
  type CatalogueExercise,
  type ManualWorkoutDraftItem,
} from "@/lib/manual-workout-builder";

interface Props {
  draft: ManualWorkoutDraftItem[];
  exercisesById: ReadonlyMap<string, CatalogueExercise>;
  replacingIndex: number | null;
  replacingExerciseName: string | null;
  pending: boolean;
  draftValid: boolean;
  saveLabel: string;
  onCancelReplace: () => void;
  onToggleReplace: (index: number) => void;
  onUpdateItem: (index: number, update: Partial<ManualWorkoutDraftItem>) => void;
  onMoveItem: (index: number, direction: "up" | "down") => void;
  onRemoveItem: (index: number, exerciseId: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function WorkoutDraftPanel({
  draft,
  exercisesById,
  replacingIndex,
  replacingExerciseName,
  pending,
  draftValid,
  saveLabel,
  onCancelReplace,
  onToggleReplace,
  onUpdateItem,
  onMoveItem,
  onRemoveItem,
  onSave,
  onCancel,
}: Props) {
  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6 xl:sticky xl:top-6">
      <p className="text-sm font-medium tracking-wide text-purple-300 uppercase">Workout draft</p>
      <h2 className="mt-1 text-2xl font-bold text-white">Your exercise order</h2>
      {replacingIndex !== null && (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-100" role="status">
            Replacing {replacingExerciseName ?? "this exercise"}. Choose an available catalogue exercise.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={onCancelReplace}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-100/25 px-3 py-2 text-sm font-medium text-amber-50 disabled:opacity-45"
          >
            <X aria-hidden="true" className="size-4" /> Cancel replace
          </button>
        </div>
      )}
      <p className="mt-2 text-sm text-blue-100/60">
        {draft.length} of {MAX_WORKOUT_EXERCISES} exercises selected
      </p>
      {draft.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
          <Plus aria-hidden="true" className="mx-auto size-8 text-white/30" />
          <p className="mt-3 font-semibold text-white">Your draft is empty</p>
        </div>
      ) : (
        <ol className="mt-5 space-y-3" aria-label="Workout draft exercises">
          {draft.map((item, index) => {
            const exercise = exercisesById.get(item.exerciseId);
            const valid =
              Number.isSafeInteger(item.sets) &&
              item.sets >= MIN_SETS &&
              item.sets <= MAX_SETS &&
              Number.isSafeInteger(item.reps) &&
              item.reps >= MIN_REPS &&
              item.reps <= MAX_REPS;
            return (
              <li key={item.exerciseId} className="rounded-xl border border-white/10 bg-black/15 p-4">
                <h3 className="font-semibold break-words text-white">
                  {index + 1}. {exercise?.name ?? "Unknown exercise"}
                </h3>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <label className="text-sm font-medium text-blue-50">
                    Sets
                    <input
                      type="number"
                      min={MIN_SETS}
                      max={MAX_SETS}
                      value={Number.isNaN(item.sets) ? "" : item.sets}
                      disabled={pending}
                      aria-invalid={!valid || undefined}
                      onChange={(event) => {
                        onUpdateItem(index, { sets: event.target.valueAsNumber });
                      }}
                      className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-white"
                    />
                  </label>
                  <label className="text-sm font-medium text-blue-50">
                    Reps
                    <input
                      type="number"
                      min={MIN_REPS}
                      max={MAX_REPS}
                      value={Number.isNaN(item.reps) ? "" : item.reps}
                      disabled={pending}
                      aria-invalid={!valid || undefined}
                      onChange={(event) => {
                        onUpdateItem(index, { reps: event.target.valueAsNumber });
                      }}
                      className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-white"
                    />
                  </label>
                </div>
                {!valid && <p className="mt-2 text-xs text-red-200">Use whole values: sets 1–99 and reps 1–999.</p>}
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      onToggleReplace(index);
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-amber-300/25 px-2 py-2 text-xs text-amber-100 disabled:opacity-35"
                    aria-label={`Replace ${exercise?.name ?? "exercise"}`}
                  >
                    <Replace aria-hidden="true" className="size-4" />{" "}
                    {replacingIndex === index ? "Replacing" : "Replace"}
                  </button>
                  <button
                    type="button"
                    disabled={index === 0 || pending}
                    onClick={() => {
                      onMoveItem(index, "up");
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-white/15 px-2 py-2 text-xs text-blue-50 disabled:opacity-35"
                    aria-label={`Move ${exercise?.name ?? "exercise"} up`}
                  >
                    <ArrowUp aria-hidden="true" className="size-4" /> Up
                  </button>
                  <button
                    type="button"
                    disabled={index === draft.length - 1 || pending}
                    onClick={() => {
                      onMoveItem(index, "down");
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-white/15 px-2 py-2 text-xs text-blue-50 disabled:opacity-35"
                    aria-label={`Move ${exercise?.name ?? "exercise"} down`}
                  >
                    <ArrowDown aria-hidden="true" className="size-4" /> Down
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      onRemoveItem(index, item.exerciseId);
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-red-300/25 px-2 py-2 text-xs text-red-200 disabled:opacity-35"
                    aria-label={`Remove ${exercise?.name ?? "exercise"}`}
                  >
                    <Trash2 aria-hidden="true" className="size-4" /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row-reverse">
        <button
          type="button"
          disabled={!draftValid || pending}
          onClick={onSave}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pending ? "Saving…" : saveLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
