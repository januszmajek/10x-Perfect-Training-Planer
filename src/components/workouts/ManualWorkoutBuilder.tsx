import { useEffect, useRef, useState } from "react";
import WorkoutDraftEditor from "@/components/workouts/WorkoutDraftEditor";
import {
  MANUAL_WORKOUT_REQUEST_VERSION,
  validateDraftItems,
  type CatalogueExercise,
  type ManualWorkoutDraftItem,
} from "@/lib/manual-workout-builder";
import type { ManualWorkoutErrorCode } from "@/lib/manual-workouts";
import { PLANNED_WORKOUT_API_PATH, parseCurrentPlanResponse } from "@/lib/planned-workout-client";
import type { CurrentPlannedWorkout } from "@/lib/planned-workouts";

interface Props {
  catalogue: CatalogueExercise[];
  initialCurrentPlan: CurrentPlannedWorkout | null;
}

interface ApiFailureEnvelope {
  code: ManualWorkoutErrorCode;
  requestId: string;
}

const API_ERROR_MESSAGES: Record<ManualWorkoutErrorCode, string> = {
  validation_failed: "The workout could not be validated. Review every sets and reps value, then try again.",
  confirmation_required: "A planned workout now exists. Review it below and confirm that you want to replace it.",
  stale_plan: "The planned workout changed before replacement. Review the refreshed plan and confirm again.",
  unauthenticated: "Your session is no longer available. Sign in again before saving this draft.",
  origin_rejected: "The save request was rejected by the security check. Reload this page before trying again.",
  persistence_failed: "The workout could not be saved. Your draft and existing plan are unchanged; try again.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readApiFailure(response: Response): Promise<ApiFailureEnvelope | null> {
  try {
    const value: unknown = await response.json();
    if (!isRecord(value) || typeof value.code !== "string" || typeof value.requestId !== "string") return null;
    if (!(value.code in API_ERROR_MESSAGES)) return null;
    return { code: value.code as ManualWorkoutErrorCode, requestId: value.requestId };
  } catch {
    return null;
  }
}

export default function ManualWorkoutBuilder({ catalogue, initialCurrentPlan }: Props) {
  const [draft, setDraft] = useState<ManualWorkoutDraftItem[]>([]);
  const [currentPlan, setCurrentPlan] = useState(initialCurrentPlan);
  const [pending, setPending] = useState(false);
  const [confirmingReplacement, setConfirmingReplacement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const knownExerciseIds = new Set(catalogue.map(({ id }) => id));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirmingReplacement && !dialog.open) dialog.showModal();
    if (!confirmingReplacement && dialog.open) dialog.close();
  }, [confirmingReplacement]);

  async function refreshCurrentPlan(): Promise<CurrentPlannedWorkout | null> {
    const response = await fetch(PLANNED_WORKOUT_API_PATH, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("REFRESH_FAILED");
    const value: unknown = await response.json();
    const currentPlan = parseCurrentPlanResponse(value);
    if (currentPlan === undefined) throw new Error("REFRESH_INVALID");
    setCurrentPlan(currentPlan);
    return currentPlan;
  }

  async function submitWorkout(
    replaceExisting: boolean,
    expectedWorkoutId: string | null,
    expectedRevision: number | null,
  ) {
    if (!validateDraftItems(draft, knownExerciseIds)) {
      setError("Fix the highlighted prescriptions before saving. Your draft has not changed.");
      return;
    }
    setPending(true);
    setError(null);
    setRequestId(null);
    try {
      const response = await fetch("/api/workouts/manual", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          version: MANUAL_WORKOUT_REQUEST_VERSION,
          replaceExisting,
          expectedWorkoutId,
          expectedRevision,
          exercises: draft,
        }),
      });
      if (response.ok && response.redirected) {
        window.location.assign(response.url);
        return;
      }
      const failure = await readApiFailure(response);
      if (!failure) throw new Error("UNEXPECTED_RESPONSE");
      setRequestId(failure.requestId);
      if (failure.code === "confirmation_required" || failure.code === "stale_plan") {
        const refreshedPlan = await refreshCurrentPlan();
        setConfirmingReplacement(failure.code === "confirmation_required" && refreshedPlan !== null);
      } else {
        setConfirmingReplacement(false);
      }
      setError(API_ERROR_MESSAGES[failure.code]);
    } catch {
      setConfirmingReplacement(false);
      setError("The network request did not complete. Your draft and existing plan are unchanged; try again.");
    } finally {
      setPending(false);
    }
  }

  function handleSave() {
    if (!validateDraftItems(draft, knownExerciseIds)) {
      setError("Add at least one valid exercise before saving.");
      return;
    }
    if (currentPlan) {
      setError(null);
      setConfirmingReplacement(true);
      return;
    }
    void submitWorkout(false, null, null);
  }

  return (
    <>
      <WorkoutDraftEditor
        catalogue={catalogue}
        draft={draft}
        pending={pending}
        saveLabel="Create and Save"
        error={error}
        onChange={(nextDraft) => {
          setDraft(nextDraft);
          setError(null);
          setRequestId(null);
        }}
        onSave={handleSave}
        onCancel={() => {
          window.location.assign("/dashboard");
        }}
      />
      {requestId && (
        <p className="mt-3 text-xs text-red-100/70">
          Support request ID: <span className="font-mono">{requestId}</span>
        </p>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby="replacement-title"
        aria-describedby="replacement-description"
        onCancel={(event) => {
          if (pending) event.preventDefault();
          else setConfirmingReplacement(false);
        }}
        onClose={() => {
          setConfirmingReplacement(false);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/15 bg-slate-950 p-5 text-white shadow-2xl backdrop:bg-slate-950/80"
      >
        <p className="text-sm font-medium tracking-wide text-amber-300 uppercase">Replacement confirmation</p>
        <h2 id="replacement-title" className="mt-2 text-2xl font-bold">
          Replace the current planned workout?
        </h2>
        <p id="replacement-description" className="mt-3 text-sm leading-6 text-blue-100/70">
          This saves the complete draft as your new plan only if the current plan is still the one you reviewed.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
          <button
            type="button"
            disabled={pending || !currentPlan}
            onClick={() => {
              if (currentPlan) void submitWorkout(true, currentPlan.id, currentPlan.revision);
            }}
            className="min-h-11 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-45"
          >
            {pending ? "Replacing…" : "Replace planned workout"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setConfirmingReplacement(false);
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
