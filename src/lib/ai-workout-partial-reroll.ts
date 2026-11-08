import type { AiWorkoutProposalResult } from "./ai-workout-contract.ts";
import { MAX_AI_WORKOUT_EXERCISES, MIN_AI_WORKOUT_EXERCISES } from "./ai-workout-contract.ts";
import { coverageOf, type RecommendationCoverage } from "./ai-workout-recommender.ts";
import { validateDraftItems, type CatalogueExercise, type ManualWorkoutDraftItem } from "./manual-workout-builder.ts";

export { coverageOf };

const MIN_REDUCED_WORKOUT_EXERCISES = 3;

export type PartialRerollMode = "cold_start" | "history_aware";

/** One ordered draft entry of a re-roll: kept with its prescription, or marked for replacement. */
export type PartialRerollItem =
  | { exerciseId: string; sets: number; reps: number }
  | { exerciseId: string; replace: true };

export interface PartialRerollPlanInput {
  mode: PartialRerollMode;
  /** k: kept exercises. */
  keptCount: number;
  /** r: marked exercises. */
  markedCount: number;
  /** c: candidate pool after kept, marked and excluded ids are removed. */
  poolCount: number;
  /** p: what the model may actually pick from (history-aware: shortlist length; cold start: c). */
  pickableCount: number;
  /** a: account-wide hard-eligible ready count before removing marked/excluded ids (history-aware only). */
  accountReadyCount?: number;
  /** m: required coverage targets the kept exercises do not provide. */
  missingCoverageCount: number;
  /** Whether every missing coverage target is available in the pool. */
  missingCoverageFeasible: boolean;
}

export interface PartialRerollNewCount {
  min: number;
  max: number;
}

export type PartialRerollNotFeasibleReason = "no_candidates" | "coverage_unreachable" | "pool_too_small";

export type PartialRerollPlan =
  | { kind: "normal"; newCount: PartialRerollNewCount }
  | { kind: "reduced_confirmation_required"; mergedSize: 3 | 4; newCount: PartialRerollNewCount }
  | { kind: "not_feasible"; reason: PartialRerollNotFeasibleReason };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Decides how many new picks a partial re-roll asks for. Pure and deterministic; the partial branch decides only via
 * this plan and never via the recommender's full-generation decision.
 */
export function planPartialReroll(input: PartialRerollPlanInput): PartialRerollPlan {
  const { mode, keptCount: k, markedCount: r, poolCount: c, pickableCount: p } = input;
  const m = input.missingCoverageCount;
  if (p <= 0) return { kind: "not_feasible", reason: "no_candidates" };
  if (!input.missingCoverageFeasible) return { kind: "not_feasible", reason: "coverage_unreachable" };

  const floor = Math.max(1, MIN_AI_WORKOUT_EXERCISES - k);
  const ceil = Math.min(MAX_AI_WORKOUT_EXERCISES - k, p);
  if (k + c >= MIN_AI_WORKOUT_EXERCISES && ceil >= floor) {
    if (m > ceil) return { kind: "not_feasible", reason: "coverage_unreachable" };
    return {
      kind: "normal",
      newCount: { min: clamp(r, floor, ceil), max: clamp(Math.max(r, m), floor, ceil) },
    };
  }

  // FR-017: the reduced 3-4 path exists only while fewer than five exercises are ready account-wide.
  const merged = k + p;
  const accountReady = input.accountReadyCount ?? Number.POSITIVE_INFINITY;
  if (
    mode === "history_aware" &&
    merged >= MIN_REDUCED_WORKOUT_EXERCISES &&
    merged < MIN_AI_WORKOUT_EXERCISES &&
    accountReady < MIN_AI_WORKOUT_EXERCISES
  ) {
    if (m > p) return { kind: "not_feasible", reason: "coverage_unreachable" };
    return { kind: "reduced_confirmation_required", mergedSize: merged as 3 | 4, newCount: { min: p, max: p } };
  }
  return { kind: "not_feasible", reason: "pool_too_small" };
}

export interface PartialRerollPicksContext {
  /** Ids the model may return (the provider enum); never contains kept, marked or excluded ids. */
  allowedIds: Iterable<string>;
  kept: readonly { exerciseId: string }[];
  catalogueById: ReadonlyMap<string, CatalogueExercise>;
  requiredCoverage: readonly RecommendationCoverage[];
  newCount: PartialRerollNewCount;
  /** History-aware only: never-completed candidate ids. */
  neverCompletedIds?: Iterable<string>;
  /** History-aware only: maximum never-completed picks. Cold start passes no budget. */
  explorationBudget?: number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

export function parsePartialRerollPicks(input: unknown, context: PartialRerollPicksContext): AiWorkoutProposalResult {
  if (!isPlainRecord(input) || !hasExactKeys(input, ["exercises"]) || !Array.isArray(input.exercises)) {
    return { ok: false, code: "invalid_proposal" };
  }
  const picks: ManualWorkoutDraftItem[] = [];
  for (const item of input.exercises) {
    if (!isPlainRecord(item) || !hasExactKeys(item, ["exerciseId", "sets", "reps"])) {
      return { ok: false, code: "invalid_proposal" };
    }
    picks.push({ exerciseId: item.exerciseId as string, sets: item.sets as number, reps: item.reps as number });
  }

  const keptIds = new Set(context.kept.map(({ exerciseId }) => exerciseId));
  const allowedIds = new Set([...context.allowedIds].filter((id) => !keptIds.has(id)));
  if (
    picks.length < context.newCount.min ||
    picks.length > context.newCount.max ||
    !validateDraftItems(picks, allowedIds)
  ) {
    return { ok: false, code: "invalid_proposal" };
  }

  if (context.explorationBudget !== undefined) {
    const neverCompleted = new Set(context.neverCompletedIds ?? []);
    const unseenPicks = picks.filter(({ exerciseId }) => neverCompleted.has(exerciseId)).length;
    if (unseenPicks > context.explorationBudget) return { ok: false, code: "invalid_proposal" };
  }

  const merged = [...context.kept, ...picks].map(({ exerciseId }) => context.catalogueById.get(exerciseId));
  const covered = new Set(merged.flatMap((exercise) => (exercise ? coverageOf(exercise) : [])));
  if (context.requiredCoverage.some((coverage) => !covered.has(coverage))) {
    return { ok: false, code: "invalid_proposal" };
  }
  return { ok: true, data: { exercises: picks } };
}

export function parsePartialRerollPicksJson(
  content: string,
  context: PartialRerollPicksContext,
): AiWorkoutProposalResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { ok: false, code: "malformed_json" };
  }
  return parsePartialRerollPicks(parsed, context);
}

/**
 * Positional merge: kept items stay in place with their submitted prescription, each marked slot takes the next pick
 * in model order (dropped when picks run out), and leftover picks are appended.
 */
export function mergePartialReroll(
  items: readonly PartialRerollItem[],
  picks: readonly ManualWorkoutDraftItem[],
): ManualWorkoutDraftItem[] {
  const queue = [...picks];
  const merged: ManualWorkoutDraftItem[] = [];
  for (const item of items) {
    if ("replace" in item) {
      const pick = queue.shift();
      if (pick) merged.push({ exerciseId: pick.exerciseId, sets: pick.sets, reps: pick.reps });
    } else {
      merged.push({ exerciseId: item.exerciseId, sets: item.sets, reps: item.reps });
    }
  }
  for (const pick of queue) merged.push({ exerciseId: pick.exerciseId, sets: pick.sets, reps: pick.reps });
  return merged;
}
