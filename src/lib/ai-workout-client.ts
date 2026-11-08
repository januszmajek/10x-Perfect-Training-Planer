import {
  MAX_REPS,
  MAX_SETS,
  MAX_WORKOUT_EXERCISES,
  MIN_REPS,
  MIN_SETS,
  isCanonicalUuid,
  type ManualWorkoutDraftItem,
} from "./manual-workout-builder.ts";
import { MAX_AI_WORKOUT_EXERCISES } from "./ai-workout-contract.ts";
import type { AiGenerationErrorCode } from "./ai-workouts.ts";

export const AI_WORKOUT_GENERATION_VERSION = 1 as const;

export type AiWorkoutProposalPreference = "liked" | "neutral";

export const MAX_REROLL_EXCLUSIONS = 20;

/** One ordered draft entry of a re-roll: kept with its prescription, or marked for replacement. */
export type AiWorkoutRerollItem =
  | { exerciseId: string; sets: number; reps: number }
  | { exerciseId: string; replace: true };

export type AiWorkoutKeptRerollItem = Extract<AiWorkoutRerollItem, { sets: number }>;

export interface AiWorkoutReroll {
  exercises: AiWorkoutRerollItem[];
  /** Cumulative exclusions for the current draft; only allowed on a partial re-roll. */
  excludedExerciseIds?: string[];
}

export interface AiWorkoutGenerationCommand {
  version: typeof AI_WORKOUT_GENERATION_VERSION;
  priorProposalId?: string;
  confirmationToken?: string;
  reroll?: AiWorkoutReroll;
}

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
  "replacement_not_feasible",
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

function isPrescription(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function parseRerollItem(value: unknown): AiWorkoutRerollItem | null {
  if (!isPlainRecord(value) || !isCanonicalUuid(value.exerciseId)) return null;
  if (hasExactKeys(value, ["exerciseId", "replace"])) {
    return value.replace === true ? { exerciseId: value.exerciseId, replace: true } : null;
  }
  if (
    hasExactKeys(value, ["exerciseId", "sets", "reps"]) &&
    isPrescription(value.sets, MIN_SETS, MAX_SETS) &&
    isPrescription(value.reps, MIN_REPS, MAX_REPS)
  ) {
    return { exerciseId: value.exerciseId, sets: value.sets, reps: value.reps };
  }
  return null;
}

function parseReroll(value: unknown): AiWorkoutReroll | null {
  if (!isPlainRecord(value) || !Object.keys(value).every((key) => key === "exercises" || key === "excludedExerciseIds"))
    return null;
  if (!Array.isArray(value.exercises) || value.exercises.length < 1 || value.exercises.length > MAX_WORKOUT_EXERCISES)
    return null;
  const exercises: AiWorkoutRerollItem[] = [];
  const itemIds = new Set<string>();
  for (const candidate of value.exercises) {
    const item = parseRerollItem(candidate);
    if (!item || itemIds.has(item.exerciseId)) return null;
    itemIds.add(item.exerciseId);
    exercises.push(item);
  }
  const markedCount = exercises.filter((item) => "replace" in item).length;
  if (markedCount === 0 || exercises.length - markedCount > MAX_AI_WORKOUT_EXERCISES - 1) return null;
  if (!("excludedExerciseIds" in value)) return { exercises };

  // Exclusions describe earlier partial replacements; a full re-roll starts over, so they are not allowed there.
  if (markedCount === exercises.length) return null;
  const excluded = value.excludedExerciseIds;
  if (!Array.isArray(excluded) || excluded.length > MAX_REROLL_EXCLUSIONS) return null;
  const excludedIds = new Set<string>();
  for (const id of excluded) {
    if (!isCanonicalUuid(id) || excludedIds.has(id) || itemIds.has(id)) return null;
    excludedIds.add(id);
  }
  return { exercises, excludedExerciseIds: [...excludedIds] };
}

const GENERATION_COMMAND_KEYS = new Set(["version", "priorProposalId", "confirmationToken", "reroll"]);

export function parseAiWorkoutGenerationCommand(input: unknown): AiWorkoutGenerationCommand | null {
  if (!isPlainRecord(input) || input.version !== AI_WORKOUT_GENERATION_VERSION) return null;
  if (!Object.keys(input).every((key) => GENERATION_COMMAND_KEYS.has(key))) return null;
  const command: AiWorkoutGenerationCommand = { version: AI_WORKOUT_GENERATION_VERSION };
  if ("priorProposalId" in input) {
    if (!isCanonicalUuid(input.priorProposalId)) return null;
    command.priorProposalId = input.priorProposalId;
  }
  if ("confirmationToken" in input) {
    if (typeof input.confirmationToken !== "string") return null;
    command.confirmationToken = input.confirmationToken;
  }
  if ("reroll" in input) {
    const reroll = parseReroll(input.reroll);
    if (!reroll) return null;
    command.reroll = reroll;
  }
  return command;
}

export function rerollKeptItems(reroll: AiWorkoutReroll): AiWorkoutKeptRerollItem[] {
  return reroll.exercises.filter((item): item is AiWorkoutKeptRerollItem => !("replace" in item));
}

export function rerollMarkedIds(reroll: AiWorkoutReroll): string[] {
  return reroll.exercises.filter((item) => "replace" in item).map(({ exerciseId }) => exerciseId);
}

export function rerollExcludedIds(reroll: AiWorkoutReroll): string[] {
  return [...(reroll.excludedExerciseIds ?? [])];
}

/** Every item is marked: a full re-roll rather than a partial replacement. */
export function isFullReroll(reroll: AiWorkoutReroll): boolean {
  return reroll.exercises.every((item) => "replace" in item);
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
