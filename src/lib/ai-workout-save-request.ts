import { isCanonicalUuid, parseManualWorkoutRequest, type ManualWorkoutRequest } from "./manual-workout-builder.ts";

export const AI_WORKOUT_SAVE_REQUEST_VERSION = 1 as const;

const REQUEST_KEYS = ["exercises", "expectedRevision", "expectedWorkoutId", "proposalId", "replaceExisting", "version"];

export interface AiWorkoutSaveRequest extends ManualWorkoutRequest {
  proposalId: string | null;
}

export type AiWorkoutSaveRequestValidation = { valid: true; value: AiWorkoutSaveRequest } | { valid: false };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

export function parseAiWorkoutSaveRequest(input: unknown): AiWorkoutSaveRequestValidation {
  if (!isPlainRecord(input) || !hasExactKeys(input, REQUEST_KEYS)) return { valid: false };
  if (input.proposalId !== null && !isCanonicalUuid(input.proposalId)) return { valid: false };

  const manualRequest = parseManualWorkoutRequest({
    version: input.version,
    replaceExisting: input.replaceExisting,
    expectedWorkoutId: input.expectedWorkoutId,
    expectedRevision: input.expectedRevision,
    exercises: input.exercises,
  });
  if (!manualRequest.valid) return { valid: false };

  return {
    valid: true,
    value: { ...manualRequest.value, proposalId: input.proposalId },
  };
}
