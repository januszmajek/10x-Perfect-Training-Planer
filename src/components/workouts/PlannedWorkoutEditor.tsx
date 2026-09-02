import { useEffect, useMemo, useRef, useState } from "react";
import WorkoutDraftEditor from "@/components/workouts/WorkoutDraftEditor";
import {
  areDraftsEqual,
  createDraftFromCurrentPlan,
  validateDraftItems,
  type CatalogueExercise,
  type ManualWorkoutDraftItem,
} from "@/lib/manual-workout-builder";
import { PLANNED_WORKOUT_API_PATH, parseCurrentPlanResponse } from "@/lib/planned-workout-client";
import { PLANNED_WORKOUT_MUTATION_VERSION } from "@/lib/planned-workout-mutation";
import type { CurrentPlannedWorkout, WorkoutErrorCode } from "@/lib/planned-workouts";

interface Props {
  catalogue: CatalogueExercise[];
  initialPlan: CurrentPlannedWorkout;
}

interface ApiFailureEnvelope {
  code: WorkoutErrorCode;
  requestId: string;
}

const API_ERROR_MESSAGES: Record<WorkoutErrorCode, string> = {
  validation_failed: "The workout could not be validated. Review every sets and reps value, then try again.",
  confirmation_required: "A replacement confirmation is required before saving this workout.",
  stale_plan: "This workout changed elsewhere. Your draft is preserved so you can review the latest plan.",
  unauthenticated: "Your session is no longer available. Sign in again before saving this draft.",
  origin_rejected: "The save request was rejected by the security check. Reload this page before trying again.",
  persistence_failed: "The workout could not be saved. Your draft is unchanged; try again.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSaveSuccess(value: unknown, expectedWorkoutId: string): value is { workoutId: string; revision: number } {
  return (
    isRecord(value) &&
    value.workoutId === expectedWorkoutId &&
    Number.isSafeInteger(value.revision) &&
    (value.revision as number) > 0
  );
}

async function readApiFailure(response: Response): Promise<ApiFailureEnvelope | null> {
  try {
    const value: unknown = await response.json();
    if (!isRecord(value) || typeof value.code !== "string" || typeof value.requestId !== "string") return null;
    if (!(value.code in API_ERROR_MESSAGES)) return null;
    return { code: value.code as WorkoutErrorCode, requestId: value.requestId };
  } catch {
    return null;
  }
}

export default function PlannedWorkoutEditor({ catalogue, initialPlan }: Props) {
  const initialDraft = useMemo(() => createDraftFromCurrentPlan(initialPlan.exercises), [initialPlan.exercises]);
  const [draft, setDraft] = useState<ManualWorkoutDraftItem[]>(initialDraft);
  const [baseline, setBaseline] = useState<ManualWorkoutDraftItem[]>(initialDraft);
  const [displayedPlan, setDisplayedPlan] = useState(initialPlan);
  const [conflictPlan, setConflictPlan] = useState<CurrentPlannedWorkout | null>(null);
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const conflictDialogRef = useRef<HTMLDialogElement>(null);
  const discardDialogRef = useRef<HTMLDialogElement>(null);
  const skipBeforeUnloadPromptRef = useRef(false);
  const knownExerciseIds = useMemo(() => new Set(catalogue.map(({ id }) => id)), [catalogue]);
  const exerciseNamesById = useMemo(() => new Map(catalogue.map(({ id, name }) => [id, name])), [catalogue]);
  const dirty = !areDraftsEqual(draft, baseline);
  const draftValid = validateDraftItems(draft, knownExerciseIds);

  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (skipBeforeUnloadPromptRef.current) return;
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [dirty]);

  useEffect(() => {
    const dialog = discardDialogRef.current;
    if (!dialog) return;
    if (confirmingDiscard && !dialog.open) dialog.showModal();
    if (!confirmingDiscard && dialog.open) dialog.close();
  }, [confirmingDiscard]);

  useEffect(() => {
    const dialog = conflictDialogRef.current;
    if (!dialog) return;
    if (conflictDialogOpen && !dialog.open) dialog.showModal();
    if (!conflictDialogOpen && dialog.open) dialog.close();
  }, [conflictDialogOpen]);

  async function loadLatestPlan(): Promise<CurrentPlannedWorkout | null> {
    const response = await fetch(PLANNED_WORKOUT_API_PATH, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("REFRESH_FAILED");
    const value: unknown = await response.json();
    const currentPlan = parseCurrentPlanResponse(value);
    if (currentPlan === undefined) throw new Error("REFRESH_INVALID");
    return currentPlan;
  }

  function returnToDashboard(status?: "workout-changed" | "workout-updated") {
    skipBeforeUnloadPromptRef.current = true;
    window.location.assign(status ? `/dashboard?status=${status}` : "/dashboard");
  }

  async function handleStaleSave() {
    try {
      const latestPlan = await loadLatestPlan();
      if (latestPlan === null) {
        returnToDashboard("workout-changed");
        return;
      }
      setDisplayedPlan(latestPlan);
      setConflictPlan(latestPlan);
      setConflictDialogOpen(true);
      setError(null);
    } catch {
      setError("The workout changed, but the latest plan could not be loaded. Your draft is still available to retry.");
    }
  }

  async function submitSave(plan: CurrentPlannedWorkout) {
    if (!validateDraftItems(draft, knownExerciseIds)) {
      setError("Fix the highlighted prescriptions before saving. Your draft has not changed.");
      return;
    }

    setPending(true);
    setError(null);
    setRequestId(null);
    try {
      const response = await fetch(PLANNED_WORKOUT_API_PATH, {
        method: "PUT",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          version: PLANNED_WORKOUT_MUTATION_VERSION,
          expectedWorkoutId: plan.id,
          expectedRevision: plan.revision,
          exercises: draft,
        }),
      });

      if (response.ok) {
        const value: unknown = await response.json();
        if (!isSaveSuccess(value, plan.id)) throw new Error("INVALID_SUCCESS_RESPONSE");
        returnToDashboard("workout-updated");
        return;
      }

      const failure = await readApiFailure(response);
      if (!failure) throw new Error("UNEXPECTED_RESPONSE");
      setError(API_ERROR_MESSAGES[failure.code]);
      setRequestId(failure.requestId);
      if (failure.code === "stale_plan") await handleStaleSave();
    } catch {
      setError("The network request did not complete. Your draft is unchanged; try again.");
    } finally {
      setPending(false);
    }
  }

  function handleSave() {
    if (!dirty || !draftValid || pending) return;
    void submitSave(conflictPlan ?? displayedPlan);
  }

  function handleLoadLatest() {
    if (!conflictPlan || pending) return;
    const nextDraft = createDraftFromCurrentPlan(conflictPlan.exercises);
    setDisplayedPlan(conflictPlan);
    setBaseline(nextDraft);
    setDraft(nextDraft);
    setConflictPlan(null);
    setConflictDialogOpen(false);
    setError(null);
    setRequestId(null);
  }

  return (
    <>
      <WorkoutDraftEditor
        catalogue={catalogue}
        draft={draft}
        pending={pending}
        saveLabel={conflictPlan ? "Review conflict" : "Save changes"}
        error={error}
        onChange={(nextDraft) => {
          setDraft(nextDraft);
          setError(null);
          setRequestId(null);
        }}
        onSave={() => {
          if (conflictPlan) setConflictDialogOpen(true);
          else handleSave();
        }}
        onCancel={() => {
          if (pending) return;
          if (dirty) setConfirmingDiscard(true);
          else returnToDashboard();
        }}
      />

      {requestId && (
        <p className="mt-3 text-xs text-red-100/70">
          Support request ID: <span className="font-mono">{requestId}</span>
        </p>
      )}

      {conflictPlan && (
        <dialog
          ref={conflictDialogRef}
          aria-labelledby="workout-conflict-title"
          aria-describedby="workout-conflict-description"
          onCancel={(event) => {
            if (pending) event.preventDefault();
            else setConflictDialogOpen(false);
          }}
          onClose={() => {
            setConflictDialogOpen(false);
          }}
          className="m-auto w-[calc(100%-2rem)] max-w-3xl rounded-2xl border border-amber-300/30 bg-slate-950 p-5 text-white shadow-2xl backdrop:bg-slate-950/80 sm:p-6"
        >
          <p className="text-sm font-medium tracking-wide text-amber-200 uppercase">Plan changed elsewhere</p>
          <h2 id="workout-conflict-title" className="mt-2 text-xl font-bold text-white">
            Review the durable plan before overwriting it
          </h2>
          <p id="workout-conflict-description" className="mt-2 text-sm leading-6 text-blue-100/70">
            Your local draft is preserved. Choose the latest saved plan or explicitly overwrite the revision shown here.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <h3 className="text-sm font-semibold text-white">Your local draft</h3>
              <ol className="mt-2 space-y-2 text-sm leading-6 text-blue-100/70">
                {draft.map((item, index) => (
                  <li key={item.exerciseId} className="flex gap-2 break-words">
                    <span className="shrink-0 text-blue-100/45">{index + 1}.</span>
                    <span>
                      {exerciseNamesById.get(item.exerciseId) ?? "Unknown exercise"} ({item.sets} × {item.reps})
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/15 p-4">
              <h3 className="text-sm font-semibold text-white">Latest saved plan</h3>
              <ol className="mt-2 space-y-2 text-sm leading-6 text-blue-100/70">
                {conflictPlan.exercises.map((exercise, index) => (
                  <li key={exercise.exerciseId} className="flex gap-2 break-words">
                    <span className="shrink-0 text-blue-100/45">{index + 1}.</span>
                    <span>
                      {exercise.name} ({exercise.sets} × {exercise.reps})
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              disabled={pending || !draftValid}
              onClick={handleSave}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending ? "Saving…" : "Overwrite with my changes"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={handleLoadLatest}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-blue-50 disabled:opacity-45"
            >
              Load latest
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setConflictDialogOpen(false);
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Keep editing
            </button>
          </div>
          {requestId && <p className="mt-4 text-xs text-amber-100/70">Support request ID: {requestId}</p>}
        </dialog>
      )}

      <dialog
        ref={discardDialogRef}
        aria-labelledby="discard-title"
        aria-describedby="discard-description"
        onCancel={(event) => {
          if (pending) event.preventDefault();
          else setConfirmingDiscard(false);
        }}
        onClose={() => {
          setConfirmingDiscard(false);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/15 bg-slate-950 p-5 text-white shadow-2xl backdrop:bg-slate-950/80"
      >
        <p className="text-sm font-medium tracking-wide text-amber-300 uppercase">Discard changes</p>
        <h2 id="discard-title" className="mt-2 text-2xl font-bold">
          Leave this workout edit?
        </h2>
        <p id="discard-description" className="mt-3 text-sm leading-6 text-blue-100/70">
          Your unsaved changes will be discarded and cannot be recovered.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              returnToDashboard();
            }}
            className="min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            Discard changes
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setConfirmingDiscard(false);
            }}
            className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-blue-50 disabled:opacity-45"
          >
            Keep editing
          </button>
        </div>
      </dialog>
    </>
  );
}
