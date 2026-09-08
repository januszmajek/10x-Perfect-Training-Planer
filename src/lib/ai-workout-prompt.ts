import type { CatalogueExercise } from "./manual-workout-builder.ts";
import type { HistoryAwareRecommendation } from "./ai-workout-recommender.ts";

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

function serializeCatalogue(catalogue: readonly CatalogueExercise[]): string {
  const context = [...catalogue]
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

  return JSON.stringify(context);
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
  requestedExerciseCount: { min: 3 | 5; max: 4 | 7 },
): AiWorkoutPromptResult {
  const shortlist = [...recommendation.shortlist]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(({ id, name, equipment, movementPattern, muscles, reasons }) => ({
      id,
      name,
      equipment,
      movementPattern,
      muscles: muscles.map(({ code, category, role }) => ({ code, category, role })),
      reasons,
    }));
  const context = JSON.stringify({
    shortlist,
    feasibleCoverage: recommendation.feasibleCoverage,
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
