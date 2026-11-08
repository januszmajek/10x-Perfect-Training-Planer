import type { CatalogueExercise } from "./manual-workout-builder.ts";
import type {
  HistoryAwareRecommendation,
  RecommendationCoverage,
  RecommendedExercise,
} from "./ai-workout-recommender.ts";
import type { HistoryAwareRequestedExerciseCount } from "./ai-workout-contract.ts";

export const MAX_AI_CATALOGUE_CONTEXT_BYTES = 64 * 1024;

export interface AiWorkoutPrompt {
  system: string;
  user: string;
}

export type AiWorkoutPromptResult =
  | { ok: true; data: AiWorkoutPrompt }
  | { ok: false; code: "catalogue_context_too_large" };

const SYSTEM_PROMPT = [
  "Create a balanced cold-start full-body workout from the supplied canonical catalogue.",
  "Return exactly 5 to 7 unique exercises. Include a lower-body primary movement, an upper-body push, an upper-body pull, and a core primary movement.",
  "Use only supplied exercise IDs. Use integer sets from 1 to 99 and integer reps from 1 to 999.",
  "Return only the JSON object specified by the response schema.",
].join(" ");

function catalogueContext(catalogue: readonly CatalogueExercise[]) {
  return [...catalogue]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      equipment: exercise.equipment,
      movementPattern: exercise.movementPattern,
      muscles: [...exercise.muscles]
        .sort((left, right) => `${left.code}:${left.role}`.localeCompare(`${right.code}:${right.role}`))
        .map((muscle) => ({ code: muscle.code, name: muscle.name, category: muscle.category, role: muscle.role })),
    }));
}

function serializeCatalogue(catalogue: readonly CatalogueExercise[]): string {
  return JSON.stringify(catalogueContext(catalogue));
}

function shortlistContext(shortlist: readonly RecommendedExercise[]) {
  return [...shortlist]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, name, equipment, movementPattern, muscles, reasons }) => ({
      id,
      name,
      equipment,
      movementPattern,
      muscles: [...muscles]
        .sort((left, right) => `${left.code}:${left.role}`.localeCompare(`${right.code}:${right.role}`))
        .map(({ code, category, role }) => ({ code, category, role })),
      eligibility: "recovery_compatible",
      reasons: [...reasons].sort(),
    }));
}

export function buildColdStartWorkoutPrompt(catalogue: readonly CatalogueExercise[]): AiWorkoutPromptResult {
  const catalogueContext = serializeCatalogue(catalogue);
  if (new TextEncoder().encode(catalogueContext).byteLength > MAX_AI_CATALOGUE_CONTEXT_BYTES) {
    return { ok: false, code: "catalogue_context_too_large" };
  }

  return { ok: true, data: { system: SYSTEM_PROMPT, user: `Canonical catalogue: ${catalogueContext}` } };
}

export function buildHistoryAwareWorkoutPrompt(
  recommendation: Pick<HistoryAwareRecommendation, "shortlist" | "feasibleCoverage">,
  requestedExerciseCount: HistoryAwareRequestedExerciseCount,
): AiWorkoutPromptResult {
  const shortlist = shortlistContext(recommendation.shortlist);
  const context = JSON.stringify({
    shortlist,
    feasibleCoverage: [...recommendation.feasibleCoverage].sort(),
    requestedExerciseCount,
  });
  if (new TextEncoder().encode(context).byteLength > MAX_AI_CATALOGUE_CONTEXT_BYTES)
    return { ok: false, code: "catalogue_context_too_large" };
  return {
    ok: true,
    data: {
      system: `Create a recovery-compatible workout using only the supplied shortlist. Return ${requestedExerciseCount.min} to ${requestedExerciseCount.max} unique exercises, include every feasible coverage target, use integer sets 1-99 and reps 1-999, and return only the JSON response schema.`,
      user: `Vetted shortlist and derived recommendation reasons: ${context}`,
    },
  };
}

export type PartialRerollPromptInput = {
  kept: readonly CatalogueExercise[];
  missingCoverage: readonly RecommendationCoverage[];
  requiredCoverage: readonly RecommendationCoverage[];
  newCount: { min: number; max: number };
} & (
  | { mode: "history_aware"; candidates: readonly RecommendedExercise[] }
  | { mode: "cold_start"; candidates: readonly CatalogueExercise[] }
);

/**
 * Prompt for a partial re-roll: kept exercises are fixed context and only the missing picks are requested. Marked and
 * excluded ids, history details, proposal ids and tokens never reach the prompt.
 */
export function buildPartialRerollPrompt(input: PartialRerollPromptInput): AiWorkoutPromptResult {
  const fixed = [...input.kept]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, name, equipment, movementPattern, muscles }) => ({
      id,
      name,
      equipment,
      movementPattern,
      muscles: [...muscles]
        .sort((left, right) => `${left.code}:${left.role}`.localeCompare(`${right.code}:${right.role}`))
        .map(({ code, category, role }) => ({ code, category, role })),
    }));
  const candidates =
    input.mode === "history_aware" ? shortlistContext(input.candidates) : catalogueContext(input.candidates);
  const requestedExerciseCount = { min: input.newCount.min, max: input.newCount.max };
  const context = JSON.stringify({
    fixed,
    candidates,
    missingCoverage: [...input.missingCoverage].sort(),
    requestedExerciseCount,
  });
  if (new TextEncoder().encode(context).byteLength > MAX_AI_CATALOGUE_CONTEXT_BYTES)
    return { ok: false, code: "catalogue_context_too_large" };
  const requiredCoverage = [...input.requiredCoverage].sort().join(", ") || "none";
  return {
    ok: true,
    data: {
      system: [
        input.mode === "history_aware"
          ? "Replace some exercises in a recovery-compatible workout."
          : "Replace some exercises in a balanced cold-start full-body workout.",
        "The fixed exercises stay in the workout and must not be returned.",
        `Return ${requestedExerciseCount.min} to ${requestedExerciseCount.max} unique exercises chosen only from the supplied candidates.`,
        `Together with the fixed exercises the workout must include every required coverage target: ${requiredCoverage}.`,
        "Use integer sets 1-99 and reps 1-999, and return only the JSON object specified by the response schema.",
      ].join(" "),
      user: `Fixed exercises, replacement candidates and missing coverage: ${context}`,
    },
  };
}
