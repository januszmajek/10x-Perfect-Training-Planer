import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useRerollSelection } from "@/components/hooks/useRerollSelection";
import PlanReplacementDialog from "@/components/workouts/PlanReplacementDialog";
import ReducedWorkoutConfirmationDialog from "@/components/workouts/ReducedWorkoutConfirmationDialog";
import WorkoutDraftEditor from "@/components/workouts/WorkoutDraftEditor";
import {
  AI_GENERATION_FAILURE_TOAST_ID,
  applyAiGenerationResponse,
  buildAiGenerationCommand,
  getAiButtonState,
  getAiPlannerRecoveryAction,
  getGenerationFailureHeadline,
  type AiButtonState,
} from "@/lib/ai-workout-planner-state";
import {
  AI_WORKOUT_FEEDBACK_VERSION,
  acknowledgeAiWorkoutFeedbackEvent,
  saveAiWorkoutPreference,
  type AiExercisePreference,
  type AiWorkoutFeedbackControls,
  type AiWorkoutPreferenceState,
} from "@/lib/ai-workout-feedback-client";
import {
  isFullReroll,
  parseAiWorkoutGenerationResponse,
  type AiWorkoutGenerationCommand,
  type AiWorkoutGenerationResponse,
  type AiWorkoutGenerationMetadata,
} from "@/lib/ai-workout-client";
import type { AiGenerationErrorCode } from "@/lib/ai-workouts";
import { AI_WORKOUT_SAVE_REQUEST_VERSION } from "@/lib/ai-workout-save-request";
import {
  MANUAL_WORKOUT_REQUEST_VERSION,
  validateDraftItems,
  type CatalogueExercise,
  type ManualWorkoutDraftItem,
} from "@/lib/manual-workout-builder";
import { PLANNED_WORKOUT_API_PATH, parseCurrentPlanResponse } from "@/lib/planned-workout-client";
import { resolvePlannedWorkoutConflict } from "@/lib/planned-workout-conflict";
import type { CurrentPlannedWorkout } from "@/lib/planned-workouts";
import type { WorkoutCatalogueNavigationState } from "@/lib/workout-catalogue-navigation";

interface Props {
  catalogue: CatalogueExercise[];
  initialCurrentPlan: CurrentPlannedWorkout | null;
  credentialConfigured: boolean;
  initialPreferences: Record<string, Exclude<AiExercisePreference, null>> | null;
  initialCatalogueNavigation: WorkoutCatalogueNavigationState;
}

type DraftOrigin = "manual" | "ai";
type PendingOperation = "generate" | "save" | null;
type ActiveProposal = Extract<AiWorkoutGenerationMetadata, { kind: "history_aware" }>;

interface ReducedConfirmationState {
  count: 3 | 4;
  token: string;
  /** The command that triggered `confirmation_required`; confirming resends it with the token. */
  command: AiWorkoutGenerationCommand;
}

function aiButtonHintText(state: AiButtonState): string | null {
  switch (state.hint) {
    case "mark_to_replace":
      return "Mark exercises to replace them, or use Mark all for a new workout.";
    case "too_many_kept":
      return "Keep at most 6 exercises when replacing.";
    case "marked_exceeds_slots":
      return `AI workouts hold at most 7 exercises — with ${state.keptCount} kept, mark at most ${7 - state.keptCount}.`;
    case "invalid_kept_prescription":
      return "Fix the highlighted sets/reps before replacing.";
    default:
      return null;
  }
}

function notifyGenerationFailure(code: AiGenerationErrorCode | "invalid_output") {
  // Visual-only: the inline role="alert" already announces the full message, so the toast content is hidden from
  // assistive technology to avoid a second announcement from Sonner's polite live region.
  toast.error(<span aria-hidden="true">{getGenerationFailureHeadline(code)}</span>, {
    id: AI_GENERATION_FAILURE_TOAST_ID,
  });
}

const GENERATION_MESSAGES: Record<AiGenerationErrorCode | "invalid_output", string> = {
  validation_failed: "The generation request could not be validated. Reload the page and try again.",
  unauthenticated: "Your session is no longer available. Sign in again before generating a workout.",
  origin_rejected: "The generation request was rejected by the security check. Reload the page before trying again.",
  persistence_failed: "Workout planning is temporarily unavailable. Your draft is unchanged.",
  confirmation_required: "A planned workout needs confirmation before it can be replaced.",
  stale_confirmation: "That reduced-workout confirmation is no longer valid. Generate again to refresh it.",
  insufficient_recovered_candidates:
    "Fewer than three exercises are eligible after recovery and personalization filters. Keep planning manually.",
  replacement_not_feasible:
    "No eligible replacements fit the exercises you kept — exercises you already replaced in this draft are not offered again. Your draft is unchanged; mark fewer exercises, use Mark all to start over with a fresh workout (this clears earlier replacements), or edit manually.",
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

export default function WorkoutBuilder({
  catalogue,
  initialCurrentPlan,
  credentialConfigured,
  initialPreferences,
  initialCatalogueNavigation,
}: Props) {
  const [draft, setDraft] = useState<ManualWorkoutDraftItem[]>([]);
  const [draftOrigin, setDraftOrigin] = useState<DraftOrigin>("manual");
  const [currentPlan, setCurrentPlan] = useState(initialCurrentPlan);
  const [pending, setPending] = useState<PendingOperation>(null);
  const [generationError, setGenerationError] = useState<AiGenerationErrorCode | "invalid_output" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [replacementPlan, setReplacementPlan] = useState<CurrentPlannedWorkout | null>(null);
  const [replacementDialogOpen, setReplacementDialogOpen] = useState(false);
  const [reducedConfirmation, setReducedConfirmation] = useState<ReducedConfirmationState | null>(null);
  const [activeProposal, setActiveProposal] = useState<ActiveProposal | null>(null);
  const [cataloguePreferences, setCataloguePreferences] = useState<Record<string, AiWorkoutPreferenceState>>(
    initialPreferences ?? {},
  );
  const [preferencePendingExerciseId, setPreferencePendingExerciseId] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const knownExerciseIds = useMemo(() => new Set(catalogue.map(({ id }) => id)), [catalogue]);
  const draftValid = validateDraftItems(draft, knownExerciseIds);
  const operationsPending = pending !== null;
  const activeProposalId = activeProposal?.proposalId ?? null;
  const reroll = useRerollSelection(draft);
  const aiButton = getAiButtonState({ draft, selectedIds: reroll.selected, credentialConfigured });
  const aiButtonHint = aiButtonHintText(aiButton);
  const allMarked = draft.length > 0 && reroll.selected.size === draft.length;
  const selectionEnabled = draft.length > 0 && credentialConfigured;
  const preferenceLoadError =
    initialPreferences === null
      ? "Your recommendation preferences could not be loaded. Reload the page to try again."
      : null;

  useEffect(() => {
    if (!activeProposalId) return;
    void acknowledgeAiWorkoutFeedbackEvent({
      version: AI_WORKOUT_FEEDBACK_VERSION,
      proposalId: activeProposalId,
      type: "exposure",
    });
  }, [activeProposalId]);

  async function generateWorkout(command: AiWorkoutGenerationCommand | null) {
    if (operationsPending || !credentialConfigured || !command) return;
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
      const transition = applyAiGenerationResponse(draft, parsed, activeProposal);
      if (!parsed?.ok && parsed?.code === "confirmation_required" && parsed.confirmationToken) {
        const triggeringCommand = { ...command };
        delete triggeringCommand.confirmationToken;
        setReducedConfirmation({
          count: parsed.availableExerciseCount ?? 3,
          token: parsed.confirmationToken,
          command: triggeringCommand,
        });
        return;
      }
      if (transition.code) {
        setGenerationError(transition.code);
        setRequestId(transition.requestId);
        if (transition.code !== "confirmation_required") notifyGenerationFailure(transition.code);
      } else if (transition.draft) {
        toast.dismiss(AI_GENERATION_FAILURE_TOAST_ID);
        setDraft(transition.draft);
        setDraftOrigin("ai");
        reroll.applySuccess(
          command,
          transition.draft.map(({ exerciseId }) => exerciseId),
        );
        setActiveProposal(transition.activeProposal);
        setPreferenceError(null);
        setReducedConfirmation(null);
        setRequestId(null);
      }
    } catch {
      setGenerationError("provider_unavailable");
      notifyGenerationFailure("provider_unavailable");
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
      const manualRequest = {
        version: MANUAL_WORKOUT_REQUEST_VERSION,
        replaceExisting,
        expectedWorkoutId: replaceExisting ? (expectedPlan?.id ?? null) : null,
        expectedRevision: replaceExisting ? (expectedPlan?.revision ?? null) : null,
        exercises: draft,
      };
      const request =
        draftOrigin === "ai"
          ? {
              ...manualRequest,
              version: AI_WORKOUT_SAVE_REQUEST_VERSION,
              proposalId: activeProposal?.proposalId ?? null,
            }
          : manualRequest;
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (response.ok) {
        window.location.assign("/dashboard");
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
        setSaveError(SAVE_ERROR_MESSAGES[failure.code] ?? "The planned workout changed before it could be saved.");
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

  function handlePreferenceChange(
    exerciseId: string,
    selectedPreference: Exclude<AiWorkoutPreferenceState, "neutral">,
  ) {
    if (initialPreferences === null || preferencePendingExerciseId) return;
    const currentPreference = cataloguePreferences[exerciseId] ?? "neutral";
    const preference: AiExercisePreference = currentPreference === selectedPreference ? null : selectedPreference;
    setPreferencePendingExerciseId(exerciseId);
    setPreferenceError(null);
    void saveAiWorkoutPreference({ version: AI_WORKOUT_FEEDBACK_VERSION, exerciseId, preference }).then(
      (savedPreference) => {
        setPreferencePendingExerciseId(null);
        if (savedPreference === undefined) {
          setPreferenceError("Your preference could not be saved. This draft is unchanged; try again.");
          return;
        }
        setCataloguePreferences((preferences) => {
          if (savedPreference === null) {
            return Object.fromEntries(Object.entries(preferences).filter(([id]) => id !== exerciseId));
          }
          return { ...preferences, [exerciseId]: savedPreference };
        });
      },
    );
  }

  const feedback: AiWorkoutFeedbackControls | undefined =
    initialPreferences === null
      ? undefined
      : {
          preferences: cataloguePreferences,
          pendingExerciseId: preferencePendingExerciseId,
          onPreferenceChange: handlePreferenceChange,
        };

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
          <div className="flex shrink-0 flex-wrap gap-3">
            {selectionEnabled && (
              <button
                type="button"
                disabled={operationsPending}
                onClick={() => {
                  if (allMarked) reroll.clearSelection();
                  else reroll.markAll(draft);
                }}
                className="min-h-11 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                {allMarked ? "Unmark all" : "Mark all"}
              </button>
            )}
            <button
              type="button"
              disabled={operationsPending || !aiButton.enabled}
              onClick={() =>
                void generateWorkout(
                  buildAiGenerationCommand({
                    draft,
                    selectedIds: reroll.selected,
                    excludedIds: reroll.excluded,
                    activeProposal,
                  }),
                )
              }
              className="min-h-11 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending === "generate" ? "Generating…" : aiButton.label}
            </button>
          </div>
        </div>
        {aiButtonHint && <p className="mt-3 text-sm text-blue-100/70">{aiButtonHint}</p>}
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

      <ReducedWorkoutConfirmationDialog
        confirmation={reducedConfirmation}
        pending={operationsPending}
        variant={
          reducedConfirmation?.command.reroll && !isFullReroll(reducedConfirmation.command.reroll) ? "partial" : "full"
        }
        onCancel={() => {
          if (!operationsPending) setReducedConfirmation(null);
        }}
        onConfirm={(confirmationToken) => {
          if (!reducedConfirmation) return;
          void generateWorkout({ ...reducedConfirmation.command, confirmationToken });
        }}
      />

      <WorkoutDraftEditor
        catalogue={catalogue}
        draft={draft}
        pending={operationsPending}
        saveLabel={pending === "save" ? "Saving…" : "Save workout"}
        error={saveError}
        originalProposalExerciseIds={activeProposal?.originalExerciseIds}
        feedback={feedback}
        preferenceError={preferenceLoadError ?? preferenceError}
        rerollSelection={selectionEnabled ? { selectedIds: reroll.selected, onToggle: reroll.toggle } : undefined}
        initialCatalogueNavigation={initialCatalogueNavigation}
        onChange={(nextDraft) => {
          setDraft(nextDraft);
          setSaveError(null);
          setRequestId(null);
        }}
        onInteraction={(interaction) => {
          if (!activeProposal) return;
          void acknowledgeAiWorkoutFeedbackEvent({
            version: AI_WORKOUT_FEEDBACK_VERSION,
            proposalId: activeProposal.proposalId,
            ...interaction,
          });
        }}
        onSave={startSave}
        onCancel={() => {
          if (!operationsPending) window.location.assign("/dashboard");
        }}
      />
      {requestId && !generationError && <p className="text-xs text-red-100/70">Support request ID: {requestId}</p>}

      <PlanReplacementDialog
        plan={replacementPlan}
        open={replacementDialogOpen}
        pending={operationsPending}
        draftValid={draftValid}
        onCancel={() => {
          setReplacementDialogOpen(false);
        }}
        onConfirm={(plan) => {
          void submitSave(true, plan);
        }}
      />
    </div>
  );
}
