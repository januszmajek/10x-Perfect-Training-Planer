import type { AiGenerationErrorCode } from "./ai-workouts.ts";
import {
  AI_WORKOUT_GENERATION_VERSION,
  MAX_REROLL_EXCLUSIONS,
  isFullReroll,
  rerollMarkedIds,
  type AiWorkoutGenerationCommand,
  type AiWorkoutGenerationMetadata,
  type AiWorkoutGenerationResponse,
  type AiWorkoutRerollItem,
} from "./ai-workout-client.ts";
import { MAX_AI_WORKOUT_EXERCISES } from "./ai-workout-contract.ts";
import { MAX_REPS, MAX_SETS, MIN_REPS, MIN_SETS, type ManualWorkoutDraftItem } from "./manual-workout-builder.ts";

export type AiPlannerRecoveryAction = "account" | "retry" | "manual" | "none";

export interface AiGenerationStateTransition {
  draft: ManualWorkoutDraftItem[] | null;
  code: AiGenerationErrorCode | "invalid_output" | null;
  requestId: string | null;
  activeProposal: Extract<AiWorkoutGenerationMetadata, { kind: "history_aware" }> | null;
}

export type AiWorkoutDraftInteraction =
  | { type: "remove"; exerciseId: string }
  | { type: "swap"; exerciseId: string; replacementExerciseId: string };

export function getAiWorkoutDraftInteraction(
  originalProposalExerciseIds: ReadonlySet<string>,
  interaction: AiWorkoutDraftInteraction,
): AiWorkoutDraftInteraction | null {
  return originalProposalExerciseIds.has(interaction.exerciseId) ? interaction : null;
}

export function applyAiGenerationResponse(
  currentDraft: ManualWorkoutDraftItem[] | null,
  response: AiWorkoutGenerationResponse | null,
  currentActiveProposal: Extract<AiWorkoutGenerationMetadata, { kind: "history_aware" }> | null = null,
): AiGenerationStateTransition {
  if (response?.ok) {
    return {
      draft: response.data.proposal.exercises,
      code: null,
      requestId: response.data.requestId,
      activeProposal: response.data.metadata.kind === "history_aware" ? response.data.metadata : null,
    };
  }

  return {
    draft: currentDraft,
    code: response?.code ?? "invalid_output",
    requestId: response?.requestId ?? null,
    activeProposal: currentActiveProposal,
  };
}

export function getAiPlannerRecoveryAction(code: AiGenerationErrorCode | "invalid_output"): AiPlannerRecoveryAction {
  switch (code) {
    case "key_not_configured":
    case "key_rejected":
      return "account";
    case "key_encryption_unavailable":
    case "model_not_configured":
      return "none";
    case "rate_limited":
    case "timeout":
    case "provider_unavailable":
    case "invalid_output":
      return "retry";
    case "history_aware_not_available":
    case "replacement_not_feasible":
      return "manual";
    default:
      return "manual";
  }
}

export const AI_GENERATION_FAILURE_TOAST_ID = "ai-generation-failure";

export type AiButtonHint = "mark_to_replace" | "too_many_kept" | "marked_exceeds_slots" | "invalid_kept_prescription";

export interface AiButtonState {
  mode: "initial" | "replace";
  label: string;
  enabled: boolean;
  hint: AiButtonHint | null;
  /** Number of exercises that would be kept; used by the `marked_exceeds_slots` copy. */
  keptCount: number;
}

function isValidPrescription(item: ManualWorkoutDraftItem): boolean {
  return (
    Number.isSafeInteger(item.sets) &&
    item.sets >= MIN_SETS &&
    item.sets <= MAX_SETS &&
    Number.isSafeInteger(item.reps) &&
    item.reps >= MIN_REPS &&
    item.reps <= MAX_REPS
  );
}

/** Label, enabled state and helper hint of the builder's single AI button, derived from the draft and selection. */
export function getAiButtonState({
  draft,
  selectedIds,
  credentialConfigured,
}: {
  draft: readonly ManualWorkoutDraftItem[];
  selectedIds: ReadonlySet<string>;
  credentialConfigured: boolean;
}): AiButtonState {
  if (draft.length === 0) {
    return { mode: "initial", label: "Generate workout", enabled: credentialConfigured, hint: null, keptCount: 0 };
  }
  const markedCount = draft.filter(({ exerciseId }) => selectedIds.has(exerciseId)).length;
  const keptCount = draft.length - markedCount;
  const label = markedCount === 0 ? "Replace selected" : `Replace selected (${markedCount})`;
  const state = (hint: AiButtonHint | null): AiButtonState => ({
    mode: "replace",
    label,
    enabled: credentialConfigured && hint === null,
    hint: credentialConfigured ? hint : null,
    keptCount,
  });
  if (markedCount === 0) return state("mark_to_replace");
  // Every exercise marked is a full re-roll; nothing is kept, so no kept limits apply.
  if (keptCount === 0) return state(null);
  if (keptCount > MAX_AI_WORKOUT_EXERCISES - 1) return state("too_many_kept");
  if (markedCount > MAX_AI_WORKOUT_EXERCISES - keptCount) return state("marked_exceeds_slots");
  const keptValid = draft.every((item) => selectedIds.has(item.exerciseId) || isValidPrescription(item));
  return state(keptValid ? null : "invalid_kept_prescription");
}

/**
 * The generate command for the current draft and selection: initial generation for an empty draft, a full re-roll
 * when every exercise is marked, otherwise a partial re-roll carrying kept prescriptions and cumulative exclusions.
 * Returns null when a non-empty draft has nothing marked.
 */
export function buildAiGenerationCommand({
  draft,
  selectedIds,
  excludedIds,
  activeProposal,
}: {
  draft: readonly ManualWorkoutDraftItem[];
  selectedIds: ReadonlySet<string>;
  excludedIds: readonly string[];
  activeProposal: { proposalId: string } | null;
}): AiWorkoutGenerationCommand | null {
  const command: AiWorkoutGenerationCommand = { version: AI_WORKOUT_GENERATION_VERSION };
  if (activeProposal) command.priorProposalId = activeProposal.proposalId;
  if (draft.length === 0) return command;

  const exercises: AiWorkoutRerollItem[] = draft.map(({ exerciseId, sets, reps }) =>
    selectedIds.has(exerciseId) ? { exerciseId, replace: true } : { exerciseId, sets, reps },
  );
  const markedCount = exercises.filter((item) => "replace" in item).length;
  if (markedCount === 0) return null;
  if (markedCount === exercises.length) return { ...command, reroll: { exercises } };

  const draftIds = new Set(draft.map(({ exerciseId }) => exerciseId));
  const excludedExerciseIds = [...new Set(excludedIds)].filter((id) => !draftIds.has(id));
  return {
    ...command,
    reroll: excludedExerciseIds.length > 0 ? { exercises, excludedExerciseIds } : { exercises },
  };
}

/** Cumulative exclusions after a successful generation: grows on a partial re-roll, resets otherwise. */
export function nextRerollExclusions({
  previous,
  command,
  mergedIds,
}: {
  previous: readonly string[];
  command: AiWorkoutGenerationCommand;
  mergedIds: readonly string[];
}): string[] {
  if (!command.reroll || isFullReroll(command.reroll)) return [];
  const merged = new Set(mergedIds);
  const next: string[] = [];
  for (const id of [...previous, ...rerollMarkedIds(command.reroll)]) {
    if (!merged.has(id) && !next.includes(id)) next.push(id);
  }
  // Oldest exclusions are evicted first.
  return next.slice(-MAX_REROLL_EXCLUSIONS);
}

/** Selection keeps only exercises still in the draft. */
export function pruneRerollSelection(
  selectedIds: ReadonlySet<string>,
  draft: readonly ManualWorkoutDraftItem[],
): Set<string> {
  return new Set(draft.map(({ exerciseId }) => exerciseId).filter((id) => selectedIds.has(id)));
}

/** Exclusions reset with an empty draft and drop ids the user put back into the draft (kept wins). */
export function pruneRerollExclusions(
  excludedIds: readonly string[],
  draft: readonly ManualWorkoutDraftItem[],
): string[] {
  if (draft.length === 0) return [];
  const draftIds = new Set(draft.map(({ exerciseId }) => exerciseId));
  return excludedIds.filter((id) => !draftIds.has(id));
}

/** Short, visual-only toast headline; the inline alert keeps the full guidance and request ID. */
export function getGenerationFailureHeadline(code: AiGenerationErrorCode | "invalid_output"): string {
  switch (code) {
    case "invalid_output":
      return "The AI returned an unbalanced workout";
    case "replacement_not_feasible":
      return "No eligible replacements";
    case "key_not_configured":
    case "key_rejected":
      return "Check your OpenRouter key";
    case "rate_limited":
      return "OpenRouter rate limit reached";
    case "timeout":
      return "Generation took too long";
    case "provider_unavailable":
      return "The AI provider is unavailable";
    default:
      return "Workout generation failed";
  }
}
