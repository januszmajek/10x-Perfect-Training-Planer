import type { AiGenerationErrorCode } from "./ai-workouts.ts";
import type { AiWorkoutGenerationResponse } from "./ai-workout-client.ts";
import type { ManualWorkoutDraftItem } from "./manual-workout-builder.ts";

export type AiPlannerRecoveryAction = "account" | "retry" | "manual" | "none";

export interface AiGenerationStateTransition {
  draft: ManualWorkoutDraftItem[] | null;
  code: AiGenerationErrorCode | "invalid_output" | null;
  requestId: string | null;
}

export function applyAiGenerationResponse(
  currentDraft: ManualWorkoutDraftItem[] | null,
  response: AiWorkoutGenerationResponse | null,
): AiGenerationStateTransition {
  if (response?.ok) {
    return { draft: response.data.proposal.exercises, code: null, requestId: response.data.requestId };
  }

  return {
    draft: currentDraft,
    code: response?.code ?? "invalid_output",
    requestId: response?.requestId ?? null,
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
      return "manual";
    default:
      return "manual";
  }
}
