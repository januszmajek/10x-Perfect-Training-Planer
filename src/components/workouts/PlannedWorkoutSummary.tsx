import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LoaderCircle, Trash2 } from "lucide-react";
import {
  IDLE_COMPLETION_STATE,
  reduceCompletionState,
  type CompletionEvent,
  type CompletionState,
} from "@/lib/planned-workout-completion";
import {
  classifyCompletionReconciliation,
  parseCompletionReconciliationResponse,
  PLANNED_WORKOUT_API_PATH,
} from "@/lib/planned-workout-client";
import { PLANNED_WORKOUT_MUTATION_VERSION } from "@/lib/planned-workout-mutation";
import type { CurrentPlannedWorkout, WorkoutErrorCode } from "@/lib/planned-workouts";

interface Props {
  plan: CurrentPlannedWorkout;
}

interface ApiFailureEnvelope {
  code: WorkoutErrorCode;
  requestId: string;
}

const COMPLETION_ERROR_MESSAGES: Record<WorkoutErrorCode, string> = {
  validation_failed: "The completion request could not be validated. Reload the dashboard before trying again.",
  confirmation_required: "This completion request could not be confirmed. Reload the dashboard before trying again.",
  stale_plan: "This planned workout changed before it could be marked done. The dashboard has been refreshed.",
  unauthenticated: "Your session is no longer available. Sign in again before marking this workout done.",
  origin_rejected:
    "The completion request was rejected by the security check. Reload the dashboard before trying again.",
  persistence_failed: "The workout could not be marked done. Your planned workout is unchanged; try again.",
};

const DELETE_ERROR_MESSAGES: Record<WorkoutErrorCode, string> = {
  validation_failed: "The deletion request could not be validated. Reload the dashboard before trying again.",
  confirmation_required: "This operation requires confirmation. Reopen the deletion dialog and try again.",
  stale_plan: "This planned workout changed before it could be deleted. The dashboard has been refreshed.",
  unauthenticated: "Your session is no longer available. Sign in again before deleting this workout.",
  origin_rejected: "The deletion request was rejected by the security check. Reload the dashboard before trying again.",
  persistence_failed: "The workout could not be deleted. Your planned workout is unchanged; try again.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readApiFailure(response: Response): Promise<ApiFailureEnvelope | null> {
  try {
    const value: unknown = await response.json();
    if (!isRecord(value) || typeof value.code !== "string" || typeof value.requestId !== "string") return null;
    if (!(value.code in COMPLETION_ERROR_MESSAGES)) return null;
    return { code: value.code as WorkoutErrorCode, requestId: value.requestId };
  } catch {
    return null;
  }
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Creation time unavailable";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

export default function PlannedWorkoutSummary({ plan }: Props) {
  const [completionState, setCompletionState] = useState<CompletionState>(IDLE_COMPLETION_STATE);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const completionStateRef = useRef<CompletionState>(IDLE_COMPLETION_STATE);
  const timerRef = useRef<number | null>(null);
  const markDoneRef = useRef<HTMLButtonElement>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mutationsLocked = completionState.kind !== "idle" || deleting;
  const originLabel = plan.origin === "manual" ? "Manual plan" : "AI-generated plan";

  function clearCompletionTimer() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function restoreCard() {
    clearCompletionTimer();
    window.requestAnimationFrame(() => markDoneRef.current?.focus());
  }

  function resetCompletion(errorMessage?: string, nextRequestId?: string | null) {
    clearCompletionTimer();
    completionStateRef.current = IDLE_COMPLETION_STATE;
    setCompletionState(IDLE_COMPLETION_STATE);
    if (errorMessage) {
      setError(errorMessage);
      setRequestId(nextRequestId ?? null);
      window.requestAnimationFrame(() => markDoneRef.current?.focus());
    }
  }

  function scheduleDeadline(deadline: number, now: number) {
    clearCompletionTimer();
    timerRef.current = window.setTimeout(
      () => {
        dispatchCompletion({ type: "deadline-reached", deadline, now: Date.now() });
      },
      Math.max(0, deadline - now),
    );
  }

  function dispatchCompletion(event: CompletionEvent) {
    const transition = reduceCompletionState(completionStateRef.current, event);
    completionStateRef.current = transition.state;
    setCompletionState(transition.state);

    if (transition.effect.type === "schedule" && "now" in event) {
      scheduleDeadline(transition.effect.deadline, event.now);
    }
    if (transition.effect.type === "restore") restoreCard();
    if (transition.effect.type === "submit") {
      clearCompletionTimer();
      void submitCompletion();
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmingDelete && !dialog.open) dialog.showModal();
    if (!confirmingDelete && dialog.open) dialog.close();
  }, [confirmingDelete]);

  useEffect(() => {
    if (completionState.kind === "grace-period") undoRef.current?.focus();
  }, [completionState]);

  useEffect(() => {
    return () => {
      clearCompletionTimer();
    };
  }, []);

  async function reconcileCompletion() {
    try {
      const response = await fetch(`${PLANNED_WORKOUT_API_PATH}?expectedWorkoutId=${encodeURIComponent(plan.id)}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      });
      const reconciliationRequestId = response.headers.get("X-Request-ID");
      if (!response.ok) throw new Error("RECONCILIATION_FAILED");
      const value: unknown = await response.json();
      const reconciliation = parseCompletionReconciliationResponse(value);
      if (!reconciliation) throw new Error("RECONCILIATION_INVALID");

      switch (classifyCompletionReconciliation(reconciliation, plan.id, plan.revision)) {
        case "completed":
          window.location.assign("/dashboard?status=workout-completed");
          return;
        case "changed":
          window.location.assign("/dashboard?status=workout-changed");
          return;
        case "unchanged":
          resetCompletion(
            "The completion did not finish. Your planned workout is still available to retry.",
            reconciliationRequestId,
          );
          return;
        case "indeterminate":
          resetCompletion(
            "Completion could not be confirmed. Reload the dashboard before trying again.",
            reconciliationRequestId,
          );
      }
    } catch {
      resetCompletion("Completion could not be confirmed. Reload the dashboard before trying again.");
    }
  }

  async function submitCompletion() {
    setError(null);
    setRequestId(null);
    try {
      const response = await fetch(PLANNED_WORKOUT_API_PATH, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          version: PLANNED_WORKOUT_MUTATION_VERSION,
          expectedWorkoutId: plan.id,
          expectedRevision: plan.revision,
        }),
      });
      if (response.status === 204) {
        window.location.assign("/dashboard?status=workout-completed");
        return;
      }

      const failure = await readApiFailure(response);
      if (!failure) {
        await reconcileCompletion();
        return;
      }
      if (failure.code === "stale_plan") {
        window.location.assign("/dashboard?status=workout-changed");
        return;
      }
      resetCompletion(COMPLETION_ERROR_MESSAGES[failure.code], failure.requestId);
    } catch {
      await reconcileCompletion();
    }
  }

  async function handleDelete() {
    if (mutationsLocked) return;
    setDeleting(true);
    setError(null);
    setRequestId(null);
    try {
      const response = await fetch(PLANNED_WORKOUT_API_PATH, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          version: PLANNED_WORKOUT_MUTATION_VERSION,
          expectedWorkoutId: plan.id,
          expectedRevision: plan.revision,
        }),
      });
      if (response.status === 204) {
        window.location.assign("/dashboard?status=workout-deleted");
        return;
      }
      const failure = await readApiFailure(response);
      if (!failure) throw new Error("UNEXPECTED_RESPONSE");
      if (failure.code === "stale_plan") {
        window.location.assign("/dashboard?status=workout-changed");
        return;
      }
      setError(DELETE_ERROR_MESSAGES[failure.code]);
      setRequestId(failure.requestId);
    } catch {
      setError("The network request did not complete. Your planned workout is unchanged; try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {completionState.kind === "grace-period"
          ? "Workout will be marked done in five seconds. Undo is available."
          : completionState.kind === "committing"
            ? "Marking workout done."
            : ""}
      </p>

      <div className={`planned-workout-transition ${completionState.kind !== "idle" ? "is-collapsed" : ""}`}>
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-7">
          <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium tracking-wide text-purple-300 uppercase">Current planned workout</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{originLabel}</h2>
              <p className="mt-2 text-sm text-blue-100/60">
                Created <time dateTime={plan.createdAt}>{formatCreatedAt(plan.createdAt)}</time>
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                ref={markDoneRef}
                type="button"
                disabled={mutationsLocked}
                onClick={() => {
                  setError(null);
                  setRequestId(null);
                  dispatchCompletion({ type: "start", now: Date.now() });
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <CheckCircle2 aria-hidden="true" className="size-4" />
                Mark done
              </button>
              <a
                href="/workouts/edit"
                aria-disabled={mutationsLocked}
                tabIndex={mutationsLocked ? -1 : undefined}
                onClick={(event) => {
                  if (mutationsLocked) event.preventDefault();
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 aria-disabled:pointer-events-none aria-disabled:opacity-45"
              >
                Edit workout
              </a>
              <a
                href="/workouts/new"
                aria-disabled={mutationsLocked}
                tabIndex={mutationsLocked ? -1 : undefined}
                onClick={(event) => {
                  if (mutationsLocked) event.preventDefault();
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 aria-disabled:pointer-events-none aria-disabled:opacity-45"
              >
                Build replacement
              </a>
              <button
                type="button"
                disabled={mutationsLocked}
                onClick={() => {
                  setError(null);
                  setRequestId(null);
                  setConfirmingDelete(true);
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-300/30 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Trash2 aria-hidden="true" className="size-4" />
                Delete workout
              </button>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            >
              {error}
              {requestId && <span className="mt-1 block text-xs text-red-100/70">Support request ID: {requestId}</span>}
            </div>
          )}

          <ol className="mt-5 space-y-3" aria-label="Planned workout exercises">
            {plan.exercises.map((exercise, index) => (
              <li
                key={exercise.exerciseId}
                className="flex min-w-0 gap-3 rounded-xl border border-white/10 bg-black/15 p-4"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-sm font-semibold text-purple-100"
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold break-words text-white">{exercise.name}</p>
                  <p className="mt-1 text-sm text-blue-100/65">
                    {exercise.sets} {exercise.sets === 1 ? "set" : "sets"} × {exercise.reps}{" "}
                    {exercise.reps === 1 ? "rep" : "reps"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {completionState.kind === "grace-period" && (
        <aside className="completion-toast" aria-label="Workout completion undo">
          <div className="min-w-0">
            <p className="font-semibold text-white">Workout will be marked done</p>
            <p className="mt-1 text-sm leading-5 text-blue-100/75">Undo is available for five seconds.</p>
            <div aria-hidden="true" className="completion-toast-progress" />
          </div>
          <button
            ref={undoRef}
            type="button"
            onClick={() => {
              dispatchCompletion({ type: "undo", now: Date.now() });
            }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-white/25 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-200"
          >
            Undo
          </button>
        </aside>
      )}

      {completionState.kind === "committing" && (
        <aside className="completion-toast" aria-label="Workout completion in progress">
          <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin text-emerald-200" />
          <p className="font-semibold text-white">Marking workout done…</p>
        </aside>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-workout-title"
        aria-describedby="delete-workout-description"
        onCancel={(event) => {
          if (deleting || completionState.kind !== "idle") event.preventDefault();
          else setConfirmingDelete(false);
        }}
        onClose={() => {
          setConfirmingDelete(false);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/15 bg-slate-950 p-5 text-white shadow-2xl backdrop:bg-slate-950/80"
      >
        <p className="text-sm font-medium tracking-wide text-red-200 uppercase">Delete planned workout</p>
        <h2 id="delete-workout-title" className="mt-2 text-2xl font-bold">
          Permanently delete this {originLabel.toLocaleLowerCase()}?
        </h2>
        <p id="delete-workout-description" className="mt-3 text-sm leading-6 text-blue-100/70">
          This removes all {plan.exercises.length} {plan.exercises.length === 1 ? "exercise" : "exercises"} from this
          planned workout. This cannot be undone.
        </p>
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
          >
            {error}
            {requestId && <span className="mt-1 block text-xs text-red-100/70">Support request ID: {requestId}</span>}
          </div>
        )}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              void handleDelete();
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            {deleting && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => {
              setConfirmingDelete(false);
            }}
            className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-blue-50 disabled:opacity-45"
          >
            Cancel
          </button>
        </div>
      </dialog>
    </>
  );
}
