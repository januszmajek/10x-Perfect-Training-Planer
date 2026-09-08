import type { AiExercisePreference, ExerciseCompletionProfileEntry } from "./history-aware-ai-profile.ts";
import type { CatalogueExercise } from "./manual-workout-builder.ts";

export const HISTORY_AWARE_RECOMMENDER_CONFIG = {
  primaryMuscleSimilarityWeight: 0.5,
  secondaryMuscleSimilarityWeight: 0.15,
  movementPatternSimilarityWeight: 0.2,
  equipmentSimilarityWeight: 0.15,
  familiarityFrequencyWeight: 1,
  familiarityRecencyWeight: 0.35,
  familiarityLastWorkoutWeight: 0.25,
  likedWeight: 1.5,
  mmrRelevanceWeight: 0.8,
  similarityConfidenceThreshold: 0.35,
  shortHistoryExplorationCap: 2,
  establishedHistoryExplorationCap: 1,
  minimumProposalSize: 3,
  normalProposalMinimumSize: 5,
  proposalCeiling: 7,
} as const;

export type RecommendationReason = "liked" | "familiar" | "never_completed";
export type RecommendationCoverage = "lower_body" | "core" | "upper_body_push" | "upper_body_pull";

export interface RecommendedExercise extends CatalogueExercise {
  reasons: RecommendationReason[];
  familiarityScore: number;
  similarityScore: number;
  recovery: { state: "ready" | "recovering"; recoveringUntil: string | null };
}

export type RecommendationDecision =
  | { kind: "normal"; requestedExerciseCount: { min: 5; max: 7 } }
  | { kind: "reduced_confirmation_required"; availableExerciseCount: 3 | 4 }
  | { kind: "insufficient_recovered_candidates"; availableExerciseCount: 0 | 1 | 2 };

export interface HistoryAwareRecommendation {
  decision: RecommendationDecision;
  readyCandidates: RecommendedExercise[];
  shortlist: RecommendedExercise[];
  feasibleCoverage: RecommendationCoverage[];
}

export interface RecommendHistoryAwareWorkoutInput {
  catalogue: readonly CatalogueExercise[];
  completions: readonly ExerciseCompletionProfileEntry[];
  preferences: ReadonlyMap<string, AiExercisePreference>;
  now?: Date;
  seed?: number;
}

interface Candidate extends RecommendedExercise {
  coverage: RecommendationCoverage[];
  rankScore: number;
}

function stableSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

function seededTieBreak(id: string, seed: number): number {
  let hash = stableSeed(seed) ^ 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function ordered<T extends { id: string }>(items: readonly T[], score: (item: T) => number, seed: number): T[] {
  return [...items].sort((left, right) => {
    const difference = score(right) - score(left);
    if (Math.abs(difference) > Number.EPSILON) return difference;
    const seededDifference = seededTieBreak(left.id, seed) - seededTieBreak(right.id, seed);
    return seededDifference || left.id.localeCompare(right.id);
  });
}

function jaccard(left: readonly string[], right: readonly string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const intersection = new Set(left.filter((item) => rightSet.has(item))).size;
  return intersection / new Set([...left, ...right]).size;
}

function structuredSimilarity(left: CatalogueExercise, right: CatalogueExercise): number {
  const leftPrimary = left.muscles.filter((muscle) => muscle.role === "primary").map((muscle) => muscle.code);
  const rightPrimary = right.muscles.filter((muscle) => muscle.role === "primary").map((muscle) => muscle.code);
  const leftSecondary = left.muscles.filter((muscle) => muscle.role === "secondary").map((muscle) => muscle.code);
  const rightSecondary = right.muscles.filter((muscle) => muscle.role === "secondary").map((muscle) => muscle.code);
  const movement = left.movementPattern !== null && left.movementPattern === right.movementPattern ? 1 : 0;
  const equipment = left.equipment === right.equipment ? 1 : 0;

  return (
    jaccard(leftPrimary, rightPrimary) * HISTORY_AWARE_RECOMMENDER_CONFIG.primaryMuscleSimilarityWeight +
    jaccard(leftSecondary, rightSecondary) * HISTORY_AWARE_RECOMMENDER_CONFIG.secondaryMuscleSimilarityWeight +
    movement * HISTORY_AWARE_RECOMMENDER_CONFIG.movementPatternSimilarityWeight +
    equipment * HISTORY_AWARE_RECOMMENDER_CONFIG.equipmentSimilarityWeight
  );
}

function exerciseCoverage(exercise: CatalogueExercise): RecommendationCoverage[] {
  const primaryCategories = new Set(
    exercise.muscles.filter((muscle) => muscle.role === "primary").map((muscle) => muscle.category),
  );
  const coverage: RecommendationCoverage[] = [];
  if (primaryCategories.has("lower_body")) coverage.push("lower_body");
  if (primaryCategories.has("core")) coverage.push("core");
  if (primaryCategories.has("upper_body") && exercise.movementPattern === "push") coverage.push("upper_body_push");
  if (primaryCategories.has("upper_body") && exercise.movementPattern === "pull") coverage.push("upper_body_pull");
  return coverage;
}

function deadlineForExercise(exercise: CatalogueExercise, completedAt: string): number | null {
  const timestamp = Date.parse(completedAt);
  if (!Number.isFinite(timestamp)) return null;
  const primaryHours = exercise.muscles
    .filter((muscle) => muscle.role === "primary")
    .map((muscle) => muscle.recoveryHours);
  if (primaryHours.length === 0) return null;
  return timestamp + Math.max(...primaryHours) * 60 * 60 * 1000;
}

function familiarity(entry: ExerciseCompletionProfileEntry, now: Date): number {
  const latest = Date.parse(entry.lastCompletedAt);
  const ageDays = Number.isFinite(latest) ? Math.max(0, (now.getTime() - latest) / 86_400_000) : 365;
  return (
    Math.log1p(entry.completedCount) * HISTORY_AWARE_RECOMMENDER_CONFIG.familiarityFrequencyWeight +
    (1 / (1 + ageDays / 30)) * HISTORY_AWARE_RECOMMENDER_CONFIG.familiarityRecencyWeight +
    (entry.inLastCompletedWorkout ? HISTORY_AWARE_RECOMMENDER_CONFIG.familiarityLastWorkoutWeight : 0)
  );
}

function selectWithMmr(
  candidates: readonly Candidate[],
  count: number,
  seed: number,
  selected: Candidate[] = [],
): Candidate[] {
  const result = [...selected];
  const remaining = candidates.filter((candidate) => !result.some((chosen) => chosen.id === candidate.id));
  while (result.length < count && remaining.length > 0) {
    const ranked = ordered(
      remaining,
      (candidate) => {
        const redundancy =
          result.length === 0 ? 0 : Math.max(...result.map((chosen) => structuredSimilarity(candidate, chosen)));
        return (
          candidate.rankScore * HISTORY_AWARE_RECOMMENDER_CONFIG.mmrRelevanceWeight -
          redundancy * (1 - HISTORY_AWARE_RECOMMENDER_CONFIG.mmrRelevanceWeight)
        );
      },
      seed,
    );
    const next = ranked[0];
    result.push(next);
    remaining.splice(remaining.indexOf(next), 1);
  }
  return result;
}

function makeDecision(readyCount: number): RecommendationDecision {
  if (readyCount >= HISTORY_AWARE_RECOMMENDER_CONFIG.normalProposalMinimumSize) {
    return { kind: "normal", requestedExerciseCount: { min: 5, max: 7 } };
  }
  if (readyCount >= HISTORY_AWARE_RECOMMENDER_CONFIG.minimumProposalSize) {
    return { kind: "reduced_confirmation_required", availableExerciseCount: readyCount as 3 | 4 };
  }
  return { kind: "insufficient_recovered_candidates", availableExerciseCount: readyCount as 0 | 1 | 2 };
}

export function recommendHistoryAwareWorkout({
  catalogue,
  completions,
  preferences,
  now = new Date(),
  seed = 0,
}: RecommendHistoryAwareWorkoutInput): HistoryAwareRecommendation {
  const profile = new Map(completions.map((entry) => [entry.exerciseId, entry]));
  const deadlines = new Map<string, number>();
  for (const entry of completions) {
    const exercise = catalogue.find((candidate) => candidate.id === entry.exerciseId);
    if (!exercise) continue;
    const deadline = deadlineForExercise(exercise, entry.lastCompletedAt);
    for (const muscle of exercise.muscles) {
      if (muscle.role === "primary" && deadline !== null) {
        deadlines.set(muscle.code, Math.max(deadlines.get(muscle.code) ?? 0, deadline));
      }
    }
  }

  const candidates: Candidate[] = catalogue.flatMap((exercise) => {
    if (preferences.get(exercise.id) === "dont_suggest") return [];
    const recoveringUntil = Math.max(
      0,
      ...exercise.muscles
        .filter((muscle) => muscle.role === "primary")
        .map((muscle) => deadlines.get(muscle.code) ?? 0),
    );
    if (recoveringUntil > now.getTime()) return [];

    const completion = profile.get(exercise.id);
    const familiarExercises = catalogue.filter((candidate) => profile.has(candidate.id));
    const similarityScore = completion
      ? 1
      : Math.max(0, ...familiarExercises.map((candidate) => structuredSimilarity(exercise, candidate)));
    const familiarityScore = completion ? familiarity(completion, now) : 0;
    const liked = preferences.get(exercise.id) === "liked";
    const reasons: RecommendationReason[] = liked ? ["liked"] : completion ? ["familiar"] : ["never_completed"];
    return [
      {
        ...exercise,
        reasons,
        familiarityScore,
        similarityScore,
        recovery: { state: "ready" as const, recoveringUntil: null },
        coverage: exerciseCoverage(exercise),
        rankScore:
          familiarityScore +
          (liked ? HISTORY_AWARE_RECOMMENDER_CONFIG.likedWeight : 0) +
          (completion ? 0 : similarityScore),
      },
    ];
  });

  const decision = makeDecision(candidates.length);
  const maximum = Math.min(candidates.length, HISTORY_AWARE_RECOMMENDER_CONFIG.proposalCeiling);
  const familiarCount = completions.length;
  const explorationCap =
    familiarCount === 0
      ? 0
      : familiarCount <= 2
        ? HISTORY_AWARE_RECOMMENDER_CONFIG.shortHistoryExplorationCap
        : HISTORY_AWARE_RECOMMENDER_CONFIG.establishedHistoryExplorationCap;
  const eligibleUnseen = candidates.filter(
    (candidate) =>
      candidate.reasons.includes("never_completed") &&
      candidate.similarityScore >= HISTORY_AWARE_RECOMMENDER_CONFIG.similarityConfidenceThreshold,
  );
  const preferredPool = candidates.filter(
    (candidate) =>
      !candidate.reasons.includes("never_completed") || eligibleUnseen.some((item) => item.id === candidate.id),
  );
  const ranked = ordered(candidates, (candidate) => candidate.rankScore, seed);
  const selected: Candidate[] = [];
  const feasibleCoverage = (["lower_body", "core", "upper_body_push", "upper_body_pull"] as const).filter((coverage) =>
    candidates.some((candidate) => candidate.coverage.includes(coverage)),
  );
  for (const coverage of feasibleCoverage) {
    if (selected.length >= maximum) break;
    const choice = ordered(
      ranked.filter(
        (candidate) => candidate.coverage.includes(coverage) && !selected.some((item) => item.id === candidate.id),
      ),
      (candidate) => candidate.rankScore,
      seed,
    )[0];
    selected.push(choice);
  }
  const selectedUnseen = selected.filter((candidate) => candidate.reasons.includes("never_completed")).length;
  const exploration = ordered(eligibleUnseen, (candidate) => candidate.rankScore, seed).slice(
    0,
    Math.max(0, explorationCap - selectedUnseen),
  );
  const preferredCandidates = ranked.filter(
    (candidate) =>
      preferredPool.some((item) => item.id === candidate.id) &&
      (!candidate.reasons.includes("never_completed") || exploration.some((item) => item.id === candidate.id)),
  );
  const preferredTarget = Math.min(
    maximum,
    Math.max(
      decision.kind === "normal" ? HISTORY_AWARE_RECOMMENDER_CONFIG.normalProposalMinimumSize : maximum,
      new Set([...selected, ...preferredCandidates].map(({ id }) => id)).size,
    ),
  );
  const preferredShortlist = selectWithMmr(preferredCandidates, preferredTarget, seed, selected);
  const shortlist = selectWithMmr(
    ranked.filter((candidate) => !preferredShortlist.some((item) => item.id === candidate.id)),
    preferredTarget,
    seed,
    preferredShortlist,
  );

  return {
    decision,
    readyCandidates: ordered(candidates, (candidate) => candidate.rankScore, seed),
    shortlist,
    feasibleCoverage,
  };
}
