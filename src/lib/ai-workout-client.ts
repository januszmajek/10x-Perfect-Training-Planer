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

export interface AiWorkoutGenerationCommand {
  version: typeof AI_WORKOUT_GENERATION_VERSION;
}

export interface AiWorkoutGenerationSuccess {
  proposal: { exercises: ManualWorkoutDraftItem[] };
  metadata: { kind: "cold_start"; exerciseCount: number };
  requestId: string;
}

export type AiWorkoutGenerationResponse =
  | { ok: true; data: AiWorkoutGenerationSuccess }
  | { ok: false; code: AiGenerationErrorCode; requestId: string | null };

const AI_GENERATION_ERROR_CODES = new Set<AiGenerationErrorCode>([
  "validation_failed",
  "unauthenticated",
  "origin_rejected",
  "persistence_failed",
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
  if (!isPlainRecord(value) || !hasExactKeys(value, ["exercises"]) || !Array.isArray(value.exercises)) return false;
  if (value.exercises.length < 5 || value.exercises.length > 7) return false;

  const ids = new Set<string>();
  return value.exercises.every((item) => {
    if (!isPlainRecord(item) || !hasExactKeys(item, ["exerciseId", "sets", "reps"])) return false;
    if (!isCanonicalUuid(item.exerciseId) || ids.has(item.exerciseId)) return false;
    ids.add(item.exerciseId);
    return (
      Number.isSafeInteger(item.sets) &&
      item.sets >= MIN_SETS &&
      item.sets <= MAX_SETS &&
      Number.isSafeInteger(item.reps) &&
      item.reps >= MIN_REPS &&
      item.reps <= MAX_REPS
    );
  });
}

export function parseAiWorkoutGenerationCommand(input: unknown): AiWorkoutGenerationCommand | null {
  return isPlainRecord(input) && hasExactKeys(input, ["version"]) && input.version === AI_WORKOUT_GENERATION_VERSION
    ? { version: AI_WORKOUT_GENERATION_VERSION }
    : null;
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

  if (
    !hasExactKeys(input, ["metadata", "proposal", "requestId"]) ||
    !isProposal(input.proposal) ||
    !isPlainRecord(input.metadata) ||
    !hasExactKeys(input.metadata, ["exerciseCount", "kind"]) ||
    input.metadata.kind !== "cold_start" ||
    input.metadata.exerciseCount !== input.proposal.exercises.length ||
    typeof input.requestId !== "string"
  ) {
    return null;
  }

  return {
    ok: true,
    data: {
      proposal: input.proposal,
      metadata: { kind: "cold_start", exerciseCount: input.metadata.exerciseCount },
      requestId: input.requestId,
    },
  };
}
