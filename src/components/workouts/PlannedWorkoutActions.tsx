import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Trash2 } from "lucide-react";
import { PLANNED_WORKOUT_API_PATH } from "@/lib/planned-workout-client";
import { PLANNED_WORKOUT_MUTATION_VERSION } from "@/lib/planned-workout-mutation";
import type { WorkoutErrorCode } from "@/lib/planned-workouts";

interface Props {
  workoutId: string;
  revision: number;
  originLabel: string;
  exerciseCount: number;
}

interface ApiFailureEnvelope {
  code: WorkoutErrorCode;
  requestId: string;
}

const API_ERROR_MESSAGES: Record<WorkoutErrorCode, string> = {
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
    if (!(value.code in API_ERROR_MESSAGES)) return null;
    return { code: value.code as WorkoutErrorCode, requestId: value.requestId };
  } catch {
    return null;
  }
}

export default function PlannedWorkoutActions({ workoutId, revision, originLabel, exerciseCount }: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmingDelete && !dialog.open) dialog.showModal();
    if (!confirmingDelete && dialog.open) dialog.close();
  }, [confirmingDelete]);

  async function handleDelete() {
    if (pending) return;
    setPending(true);
    setError(null);
    setRequestId(null);
    try {
      const response = await fetch(PLANNED_WORKOUT_API_PATH, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          version: PLANNED_WORKOUT_MUTATION_VERSION,
          expectedWorkoutId: workoutId,
          expectedRevision: revision,
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
      setError(API_ERROR_MESSAGES[failure.code]);
      setRequestId(failure.requestId);
    } catch {
      setError("The network request did not complete. Your planned workout is unchanged; try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
        <a
          href="/workouts/edit"
          className="inline-flex min-h-11 items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
        >
          Edit workout
        </a>
        <a
          href="/workouts/new"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
        >
          Build replacement
        </a>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setRequestId(null);
            setConfirmingDelete(true);
          }}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-300/30 px-4 py-2.5 text-sm font-semibold text-red-200 transition-colors hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Delete workout
        </button>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="delete-workout-title"
        aria-describedby="delete-workout-description"
        onCancel={(event) => {
          if (pending) event.preventDefault();
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
          This removes all {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"} from this planned workout.
          This cannot be undone.
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
            disabled={pending}
            onClick={() => {
              void handleDelete();
            }}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-45"
          >
            {pending && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
            {pending ? "Deleting…" : "Delete permanently"}
          </button>
          <button
            type="button"
            disabled={pending}
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
