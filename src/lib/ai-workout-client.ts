import {
  MAX_REPS,
  MAX_SETS,
  MIN_REPS,
  MIN_SETS,
  isCanonicalUuid,
  type ManualWorkoutDraftItem,
} from "./manual-workout-builder.ts";
import type { AiGenerationErrorCode } from "./ai-workouts.ts";

export const AI_WORKOUT_GENERATION_VERSION = 1 as const;

export type AiWorkoutProposalPreference = "liked" | "neutral";

export type AiWorkoutGenerationCommand =
  | { version: typeof AI_WORKOUT_GENERATION_VERSION }
  | { version: typeof AI_WORKOUT_GENERATION_VERSION; priorProposalId: string }
  | { version: typeof AI_WORKOUT_GENERATION_VERSION; confirmationToken: string }
  | { version: typeof AI_WORKOUT_GENERATION_VERSION; confirmationToken: string; priorProposalId: string };

export type AiWorkoutGenerationMetadata =
  | { kind: "cold_start"; exerciseCount: number }
  | {
      kind: "history_aware";
      proposalId: string;
      exerciseCount: number;
      reduced: boolean;
      originalExerciseIds: string[];
      preferences: Record<string, AiWorkoutProposalPreference>;
    };

export interface AiWorkoutGenerationSuccess {
  proposal: { exercises: ManualWorkoutDraftItem[] };
  metadata: AiWorkoutGenerationMetadata;
  requestId: string;
}

export type AiWorkoutGenerationResponse =
  | { ok: true; data: AiWorkoutGenerationSuccess }
  | {
      ok: false;
      code: AiGenerationErrorCode;
      requestId: string | null;
      availableExerciseCount?: 3 | 4;
      confirmationToken?: string;
    };

const AI_GENERATION_ERROR_CODES = new Set<AiGenerationErrorCode>([
  "validation_failed",
  "unauthenticated",
  "origin_rejected",
  "persistence_failed",
  "confirmation_required",
  "stale_confirmation",
  "insufficient_recovered_candidates",
  "stale_plan",
  "history_aware_not_available",
  "key_not_configured",
  "key_encryption_unavailable",
  "key_rejected",
  "rate_limited",
  "timeout",
  "provider_unavailable",
  "invalid_output",
  "catalogue_context_too_large",
  "model_not_configured",
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function isProposal(value: unknown): value is { exercises: ManualWorkoutDraftItem[] } {
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ["exercises"]) ||
    !Array.isArray(value.exercises) ||
    value.exercises.length < 3 ||
    value.exercises.length > 7
  ) {
    return false;
  }
  const ids = new Set<string>();
  return value.exercises.every((item) => {
    if (
      !isPlainRecord(item) ||
      !hasExactKeys(item, ["exerciseId", "sets", "reps"]) ||
      !isCanonicalUuid(item.exerciseId)
    ) {
      return false;
    }
    if (ids.has(item.exerciseId)) return false;
    ids.add(item.exerciseId);
    return (
      typeof item.sets === "number" &&
      Number.isSafeInteger(item.sets) &&
      item.sets >= MIN_SETS &&
      item.sets <= MAX_SETS &&
      typeof item.reps === "number" &&
      Number.isSafeInteger(item.reps) &&
      item.reps >= MIN_REPS &&
      item.reps <= MAX_REPS
    );
  });
}

export function parseAiWorkoutGenerationCommand(input: unknown): AiWorkoutGenerationCommand | null {
  if (!isPlainRecord(input) || input.version !== AI_WORKOUT_GENERATION_VERSION) return null;
  if (hasExactKeys(input, ["version"])) return { version: AI_WORKOUT_GENERATION_VERSION };
  if (hasExactKeys(input, ["version", "priorProposalId"]) && isCanonicalUuid(input.priorProposalId)) {
    return { version: AI_WORKOUT_GENERATION_VERSION, priorProposalId: input.priorProposalId };
  }
  if (hasExactKeys(input, ["version", "confirmationToken"]) && typeof input.confirmationToken === "string") {
    return { version: AI_WORKOUT_GENERATION_VERSION, confirmationToken: input.confirmationToken };
  }
  if (
    hasExactKeys(input, ["version", "confirmationToken", "priorProposalId"]) &&
    typeof input.confirmationToken === "string" &&
    isCanonicalUuid(input.priorProposalId)
  ) {
    return {
      version: AI_WORKOUT_GENERATION_VERSION,
      confirmationToken: input.confirmationToken,
      priorProposalId: input.priorProposalId,
    };
  }
  return null;
}

export function parseAiWorkoutGenerationResponse(input: unknown): AiWorkoutGenerationResponse | null {
  if (!isPlainRecord(input)) return null;
  if (hasExactKeys(input, ["code", "requestId"])) {
    return typeof input.code === "string" && AI_GENERATION_ERROR_CODES.has(input.code as AiGenerationErrorCode)
      ? {
          ok: false,
          code: input.code as AiGenerationErrorCode,
          requestId: typeof input.requestId === "string" ? input.requestId : null,
        }
      : null;
  }
  if (hasExactKeys(input, ["availableExerciseCount", "code", "confirmationToken", "requestId"])) {
    return input.code === "confirmation_required" &&
      (input.availableExerciseCount === 3 || input.availableExerciseCount === 4) &&
      typeof input.confirmationToken === "string" &&
      typeof input.requestId === "string"
      ? {
          ok: false,
          code: "confirmation_required",
          requestId: input.requestId,
          availableExerciseCount: input.availableExerciseCount,
          confirmationToken: input.confirmationToken,
        }
      : null;
  }
  if (
    !hasExactKeys(input, ["metadata", "proposal", "requestId"]) ||
    !isProposal(input.proposal) ||
    typeof input.requestId !== "string" ||
    !isPlainRecord(input.metadata)
  )
    return null;
  if (
    hasExactKeys(input.metadata, ["exerciseCount", "kind"]) &&
    input.metadata.kind === "cold_start" &&
    typeof input.metadata.exerciseCount === "number" &&
    input.metadata.exerciseCount === input.proposal.exercises.length &&
    input.proposal.exercises.length >= 5
  ) {
    return {
      ok: true,
      data: {
        proposal: input.proposal,
        metadata: { kind: "cold_start", exerciseCount: input.metadata.exerciseCount },
        requestId: input.requestId,
      },
    };
  }
  if (
    !hasExactKeys(input.metadata, [
      "exerciseCount",
      "kind",
      "originalExerciseIds",
      "preferences",
      "proposalId",
      "reduced",
    ]) ||
    input.metadata.kind !== "history_aware" ||
    !isCanonicalUuid(input.metadata.proposalId) ||
    typeof input.metadata.reduced !== "boolean" ||
    typeof input.metadata.exerciseCount !== "number" ||
    input.metadata.exerciseCount !== input.proposal.exercises.length ||
    !Array.isArray(input.metadata.originalExerciseIds) ||
    !input.metadata.originalExerciseIds.every(isCanonicalUuid) ||
    !isPlainRecord(input.metadata.preferences)
  )
    return null;
  const count = input.proposal.exercises.length;
  if ((input.metadata.reduced && (count < 3 || count > 4)) || (!input.metadata.reduced && count < 5)) return null;
  const proposalIds = input.proposal.exercises.map(({ exerciseId }) => exerciseId);
  const originalExerciseIds = input.metadata.originalExerciseIds;
  if (
    new Set(originalExerciseIds).size !== originalExerciseIds.length ||
    originalExerciseIds.length !== proposalIds.length ||
    originalExerciseIds.some((id) => !proposalIds.includes(id))
  ) {
    return null;
  }
  const preferenceIds = Object.keys(input.metadata.preferences);
  if (
    preferenceIds.length !== originalExerciseIds.length ||
    preferenceIds.some((id) => !originalExerciseIds.includes(id))
  ) {
    return null;
  }
  const preferences: Record<string, AiWorkoutProposalPreference> = {};
  for (const id of originalExerciseIds) {
    const preference = input.metadata.preferences[id];
    if (preference !== "liked" && preference !== "neutral") return null;
    preferences[id] = preference;
  }
  return {
    ok: true,
    data: {
      proposal: input.proposal,
      metadata: {
        kind: "history_aware",
        proposalId: input.metadata.proposalId,
        exerciseCount: count,
        reduced: input.metadata.reduced,
        originalExerciseIds: [...originalExerciseIds],
        preferences,
      },
      requestId: input.requestId,
    },
  };
}
