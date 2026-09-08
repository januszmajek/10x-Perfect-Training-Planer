import { useEffect, useMemo, useRef, useState } from "react";
import WorkoutDraftEditor from "@/components/workouts/WorkoutDraftEditor";
import { applyAiGenerationResponse, getAiPlannerRecoveryAction } from "@/lib/ai-workout-planner-state";
import {
  AI_WORKOUT_GENERATION_VERSION,
  parseAiWorkoutGenerationResponse,
  type AiWorkoutGenerationCommand,
  type AiWorkoutGenerationResponse,
} from "@/lib/ai-workout-client";
import type { AiGenerationErrorCode } from "@/lib/ai-workouts";
import {
  MANUAL_WORKOUT_REQUEST_VERSION,
  validateDraftItems,
  type CatalogueExercise,
  type ManualWorkoutDraftItem,
} from "@/lib/manual-workout-builder";
import { PLANNED_WORKOUT_API_PATH, parseCurrentPlanResponse } from "@/lib/planned-workout-client";
import { resolvePlannedWorkoutConflict } from "@/lib/planned-workout-conflict";
import type { CurrentPlannedWorkout } from "@/lib/planned-workouts";

interface Props {
  catalogue: CatalogueExercise[];
  initialCurrentPlan: CurrentPlannedWorkout | null;
  credentialConfigured: boolean;
}

type DraftOrigin = "manual" | "ai";
type PendingOperation = "generate" | "save" | null;

const GENERATION_MESSAGES: Record<AiGenerationErrorCode | "invalid_output", string> = {
  validation_failed: "The generation request could not be validated. Reload the page and try again.",
  unauthenticated: "Your session is no longer available. Sign in again before generating a workout.",
  origin_rejected: "The generation request was rejected by the security check. Reload the page before trying again.",
  persistence_failed: "Workout planning is temporarily unavailable. Your draft is unchanged.",
  confirmation_required: "A planned workout needs confirmation before it can be replaced.",
  stale_confirmation: "That reduced-workout confirmation is no longer valid. Generate again to refresh it.",
  insufficient_recovered_candidates:
    "Fewer than three exercises are eligible after recovery and personalization filters. Keep planning manually.",
  stale_plan: "Your planned workout changed elsewhere. Refresh it before saving this draft.",
  history_aware_not_available:
    "Personalized AI planning is next. This balanced starter is available only before your first completed workout.",
  key_not_configured: "Add an OpenRouter key in Account before generating a workout.",
  key_encryption_unavailable: "Key configuration is temporarily unavailable. Your draft is unchanged.",
  key_rejected: "Your OpenRouter key was rejected. Remove it in Account, then add a new key before trying again.",
  rate_limited: "Your OpenRouter key is rate limited. Wait a moment, then generate again.",
  timeout: "Generation took too long. Your draft is unchanged; try again when you are ready.",
  provider_unavailable: "The AI provider is temporarily unavailable. Your draft is unchanged; try again.",
  invalid_output: "The AI response was not a valid balanced workout. Your draft is unchanged; try again.",
  catalogue_context_too_large: "The workout catalogue could not be prepared for generation.",
  model_not_configured: "AI workout generation is temporarily unavailable. Your draft is unchanged.",
};

const SAVE_ERROR_MESSAGES: Partial<Record<AiGenerationErrorCode, string>> = {
  validation_failed: "Fix the highlighted prescriptions before saving. Your draft has not changed.",
  unauthenticated: "Your session is no longer available. Sign in again before saving this draft.",
  origin_rejected: "The save request was rejected by the security check. Reload this page before trying again.",
  persistence_failed: "The workout could not be saved. Your draft and existing plan are unchanged; try again.",
  stale_plan: "The planned workout changed before replacement. Review the latest plan and confirm again.",
  confirmation_required: "A planned workout already exists. Review it and confirm replacement.",
};

function responseFailure(response: AiWorkoutGenerationResponse | null): AiWorkoutGenerationResponse {
  return response ?? { ok: false, code: "invalid_output", requestId: null };
}

export default function WorkoutBuilder({ catalogue, initialCurrentPlan, credentialConfigured }: Props) {
  const [draft, setDraft] = useState<ManualWorkoutDraftItem[]>([]);
  const [draftOrigin, setDraftOrigin] = useState<DraftOrigin>("manual");
  const [currentPlan, setCurrentPlan] = useState(initialCurrentPlan);
  const [pending, setPending] = useState<PendingOperation>(null);
  const [generationError, setGenerationError] = useState<AiGenerationErrorCode | "invalid_output" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [replacementPlan, setReplacementPlan] = useState<CurrentPlannedWorkout | null>(null);
  const [replacementDialogOpen, setReplacementDialogOpen] = useState(false);
  const [reducedConfirmation, setReducedConfirmation] = useState<{ count: 3 | 4; token: string } | null>(null);
  const replacementDialogRef = useRef<HTMLDialogElement>(null);
  const reducedConfirmationDialogRef = useRef<HTMLDialogElement>(null);
  const knownExerciseIds = useMemo(() => new Set(catalogue.map(({ id }) => id)), [catalogue]);
  const draftValid = validateDraftItems(draft, knownExerciseIds);
  const operationsPending = pending !== null;

  useEffect(() => {
    const dialog = replacementDialogRef.current;
    if (!dialog) return;
    if (replacementDialogOpen && !dialog.open) dialog.showModal();
    if (!replacementDialogOpen && dialog.open) dialog.close();
  }, [replacementDialogOpen]);

  useEffect(() => {
    const dialog = reducedConfirmationDialogRef.current;
    if (!dialog) return;
    if (reducedConfirmation && !dialog.open) dialog.showModal();
    if (!reducedConfirmation && dialog.open) dialog.close();
  }, [reducedConfirmation]);

  async function generateWorkout(command: AiWorkoutGenerationCommand = { version: AI_WORKOUT_GENERATION_VERSION }) {
    if (operationsPending || !credentialConfigured) return;
    setPending("generate");
    setGenerationError(null);
    setSaveError(null);
    setRequestId(null);
    try {
      const response = await fetch("/api/workouts/ai/generate", {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(command),
      });
      let parsed: AiWorkoutGenerationResponse | null = null;
      try {
        parsed = parseAiWorkoutGenerationResponse(await response.json());
      } catch {
        parsed = null;
      }
      const transition = applyAiGenerationResponse(draft, parsed);
      if (!parsed?.ok && parsed?.code === "confirmation_required" && parsed.confirmationToken) {
        setReducedConfirmation({ count: parsed.availableExerciseCount ?? 3, token: parsed.confirmationToken });
        return;
      }
      if (transition.code) {
        setGenerationError(transition.code);
        setRequestId(transition.requestId);
      } else if (transition.draft) {
        setDraft(transition.draft);
        setDraftOrigin("ai");
        setReducedConfirmation(null);
        setRequestId(null);
      }
    } catch {
      setGenerationError("provider_unavailable");
    } finally {
      setPending(null);
    }
  }

  async function refreshCurrentPlan(): Promise<CurrentPlannedWorkout | null> {
    const response = await fetch(PLANNED_WORKOUT_API_PATH, {
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("REFRESH_FAILED");
    const current = parseCurrentPlanResponse(await response.json());
    if (current === undefined) throw new Error("REFRESH_INVALID");
    return current;
  }

  async function handleSaveConflict(code: "confirmation_required" | "stale_plan", failureRequestId: string | null) {
    try {
      const transition = resolvePlannedWorkoutConflict(code, await refreshCurrentPlan());
      if (transition.kind === "latest-plan-missing") {
        setCurrentPlan(null);
        setReplacementPlan(null);
        setReplacementDialogOpen(false);
        setSaveError(
          "The latest planned workout is no longer available. Your draft is preserved; save again to create it.",
        );
        return;
      }
      setCurrentPlan(transition.latestPlan);
      setReplacementPlan(transition.latestPlan);
      setReplacementDialogOpen(true);
      setRequestId(failureRequestId);
    } catch {
      setSaveError(
        "The planned workout changed, but the latest plan could not be loaded. Your draft is still available.",
      );
      setRequestId(failureRequestId);
    }
  }

  async function submitSave(replaceExisting: boolean, expectedPlan: CurrentPlannedWorkout | null) {
    if (!draftValid || operationsPending || (replaceExisting && !expectedPlan)) return;
    setPending("save");
    setSaveError(null);
    setRequestId(null);
    const path = draftOrigin === "ai" ? "/api/workouts/ai/save" : "/api/workouts/manual";
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          version: MANUAL_WORKOUT_REQUEST_VERSION,
          replaceExisting,
          expectedWorkoutId: replaceExisting ? (expectedPlan?.id ?? null) : null,
          expectedRevision: replaceExisting ? (expectedPlan?.revision ?? null) : null,
          exercises: draft,
        }),
      });
      if (response.ok && response.redirected) {
        window.location.assign(response.url);
        return;
      }
      let parsed: AiWorkoutGenerationResponse | null = null;
      try {
        parsed = parseAiWorkoutGenerationResponse(await response.json());
      } catch {
        parsed = null;
      }
      const failure = responseFailure(parsed);
      if (failure.ok) throw new Error("UNEXPECTED_SUCCESS_RESPONSE");
      setRequestId(failure.requestId);
      if (failure.code === "confirmation_required" || failure.code === "stale_plan") {
        setSaveError(SAVE_ERROR_MESSAGES[failure.code]);
        await handleSaveConflict(failure.code, failure.requestId);
      } else {
        setReplacementDialogOpen(false);
        setSaveError(SAVE_ERROR_MESSAGES[failure.code] ?? "The workout could not be saved. Your draft is unchanged.");
      }
    } catch {
      setReplacementDialogOpen(false);
      setSaveError("The network request did not complete. Your draft and existing plan are unchanged; try again.");
    } finally {
      setPending(null);
    }
  }

  function startSave() {
    if (!draftValid || operationsPending) return;
    if (currentPlan) {
      setReplacementPlan(currentPlan);
      setReplacementDialogOpen(true);
      return;
    }
    void submitSave(false, null);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/10 backdrop-blur-xl sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-white">AI workout proposal</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-blue-100/65">
              Generate a balanced full-body proposal, then adjust every exercise and prescription before saving.
            </p>
          </div>
          <button
            type="button"
            disabled={operationsPending || !credentialConfigured}
            onClick={() => void generateWorkout()}
            className="min-h-11 shrink-0 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending === "generate" ? "Generating…" : "Generate workout"}
          </button>
        </div>
        {!credentialConfigured && (
          <p className="mt-4 text-sm text-amber-100">
            Add an OpenRouter key in{" "}
            <a className="underline underline-offset-2" href="/account">
              Account
            </a>{" "}
            to enable generation.
          </p>
        )}
        {generationError && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-50"
          >
            <p>{GENERATION_MESSAGES[generationError]}</p>
            {getAiPlannerRecoveryAction(generationError) === "account" && (
              <a className="mt-2 inline-flex underline underline-offset-2" href="/account">
                Go to Account
              </a>
            )}
            {requestId && <p className="mt-2 text-xs text-amber-100/70">Support request ID: {requestId}</p>}
          </div>
        )}
      </section>

      <dialog
        ref={reducedConfirmationDialogRef}
        aria-labelledby="reduced-confirmation-title"
        className="m-auto w-[calc(100%-2rem)] max-w-[30rem] rounded-2xl border border-white/15 bg-slate-950 p-0 text-white shadow-2xl backdrop:bg-black/70"
        onCancel={(event) => {
          event.preventDefault();
          if (!operationsPending) setReducedConfirmation(null);
        }}
      >
        <div className="space-y-4 p-6">
          <h2 id="reduced-confirmation-title" className="text-lg font-semibold">
            Generate a smaller workout?
          </h2>
          <p className="text-sm leading-6 text-blue-100/75">
            Only {reducedConfirmation?.count ?? 0} recovery-compatible exercises are available right now. You can keep
            planning manually, or generate a workout with exactly that many exercises.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              disabled={operationsPending}
              onClick={() => {
                setReducedConfirmation(null);
              }}
              className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold disabled:opacity-45"
            >
              Keep planning manually
            </button>
            <button
              type="button"
              disabled={operationsPending || !reducedConfirmation}
              onClick={() => {
                if (!reducedConfirmation) return;
                void generateWorkout({
                  version: AI_WORKOUT_GENERATION_VERSION,
                  confirmationToken: reducedConfirmation.token,
                });
              }}
              className="min-h-11 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold disabled:opacity-45"
            >
              {pending === "generate" ? "Generating…" : "Generate smaller workout"}
            </button>
          </div>
        </div>
      </dialog>

      <WorkoutDraftEditor
        catalogue={catalogue}
        draft={draft}
        pending={operationsPending}
        saveLabel={pending === "save" ? "Saving…" : "Save workout"}
        error={saveError}
        onChange={(nextDraft) => {
          setDraft(nextDraft);
          setSaveError(null);
          setRequestId(null);
        }}
        onSave={startSave}
        onCancel={() => {
          if (!operationsPending) window.location.assign("/dashboard");
        }}
      />
      {requestId && !generationError && <p className="text-xs text-red-100/70">Support request ID: {requestId}</p>}

      {replacementPlan && (
        <dialog
          ref={replacementDialogRef}
          aria-labelledby="replacement-title"
          aria-describedby="replacement-description"
          onCancel={(event) => {
            if (operationsPending) event.preventDefault();
            else setReplacementDialogOpen(false);
          }}
          onClose={() => {
            setReplacementDialogOpen(false);
          }}
          className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-2xl border border-amber-300/30 bg-slate-950 p-5 text-white shadow-2xl backdrop:bg-slate-950/80 sm:p-6"
        >
          <p className="text-sm font-medium tracking-wide text-amber-200 uppercase">Replacement confirmation</p>
          <h2 id="replacement-title" className="mt-2 text-xl font-bold">
            Replace the current planned workout?
          </h2>
          <p id="replacement-description" className="mt-2 text-sm leading-6 text-blue-100/70">
            This draft is still local. It will replace this plan only if its current revision still matches the one
            shown here.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              disabled={operationsPending || !draftValid}
              onClick={() => void submitSave(true, replacementPlan)}
              className="min-h-11 rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-45"
            >
              {pending === "save" ? "Replacing…" : "Replace planned workout"}
            </button>
            <button
              type="button"
              disabled={operationsPending}
              onClick={() => {
                setReplacementDialogOpen(false);
              }}
              className="min-h-11 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-blue-50 disabled:opacity-45"
            >
              Keep editing
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
