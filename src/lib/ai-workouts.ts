import {
  parseAiWorkoutProposalJson,
  parseHistoryAwareAiWorkoutProposalJson,
  type AiWorkoutProposal,
  type HistoryAwareRequestedExerciseCount,
} from "./ai-workout-contract.ts";
import {
  buildColdStartWorkoutPrompt,
  buildHistoryAwareWorkoutPrompt,
  buildPartialRerollPrompt,
} from "./ai-workout-prompt.ts";
import { requestOpenRouterWorkout, type OpenRouterFailureCode } from "./openrouter-client.ts";
import { validateDraftItems, type CatalogueExercise } from "./manual-workout-builder.ts";
import {
  loadColdStartEligibility,
  loadWorkoutCatalogue,
  workoutFailure,
  type WorkoutFailure,
  type WorkoutFailureLayer,
} from "./planned-workouts.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { loadHistoryAwareAiProfile, type HistoryAwareAiProfile } from "./history-aware-ai-profile.ts";
import {
  RECOMMENDATION_COVERAGES,
  coverageOf,
  recommendHistoryAwareWorkout,
  type RecommendationCoverage,
} from "./ai-workout-recommender.ts";
import {
  createReducedGenerationConfirmation,
  digestConfirmationNonce,
  fingerprintCandidates,
  fingerprintPartialReroll,
  verifyReducedGenerationConfirmation,
} from "./ai-workout-confirmation.ts";
import {
  isFullReroll,
  rerollExcludedIds,
  rerollKeptItems,
  rerollMarkedIds,
  type AiWorkoutGenerationCommand,
  type AiWorkoutGenerationMetadata,
  type AiWorkoutReroll,
} from "./ai-workout-client.ts";
import {
  mergePartialReroll,
  parsePartialRerollPicksJson,
  planPartialReroll,
  type PartialRerollPlan,
} from "./ai-workout-partial-reroll.ts";
import type { AiWorkoutSaveRequest } from "./ai-workout-save-request.ts";

type WorkoutClient = SupabaseClient<Database>;
type SaveAiPlannedWorkoutReplacementArgs = Pick<
  Database["public"]["Functions"]["save_ai_planned_workout"]["Args"],
  "p_expected_revision" | "p_expected_workout_id" | "p_replace_existing"
>;

export type AiGenerationErrorCode =
  | "validation_failed"
  | "unauthenticated"
  | "origin_rejected"
  | "persistence_failed"
  | "confirmation_required"
  | "stale_confirmation"
  | "insufficient_recovered_candidates"
  | "replacement_not_feasible"
  | "history_aware_not_available"
  | "stale_plan"
  | "key_not_configured"
  | "key_encryption_unavailable"
  | "key_rejected"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "invalid_output"
  | "catalogue_context_too_large"
  | "model_not_configured";

export interface AiGenerationFailure {
  ok: false;
  code: AiGenerationErrorCode;
  internal: { layer: WorkoutFailureLayer; technicalCode: string };
  confirmation?: { availableExerciseCount: 3 | 4; token: string };
}

export type AiGenerationResult<T> = { ok: true; data: T } | AiGenerationFailure;

export interface GeneratedAiWorkout {
  proposal: AiWorkoutProposal;
  metadata: AiWorkoutGenerationMetadata;
}

export interface AiWorkoutGenerationDependencies {
  decryptOwnedAiProviderKey: (
    client: WorkoutClient,
    userId: string | null,
  ) => Promise<{ ok: true; data: string } | { ok: false; reason: string }>;
  loadColdStartEligibility: typeof loadColdStartEligibility;
  loadWorkoutCatalogue: typeof loadWorkoutCatalogue;
  buildColdStartWorkoutPrompt: typeof buildColdStartWorkoutPrompt;
  requestOpenRouterWorkout: typeof requestOpenRouterWorkout;
  parseAiWorkoutProposalJson: typeof parseAiWorkoutProposalJson;
  loadHistoryAwareAiProfile?: typeof loadHistoryAwareAiProfile;
  recommendHistoryAwareWorkout?: typeof recommendHistoryAwareWorkout;
  buildHistoryAwareWorkoutPrompt?: typeof buildHistoryAwareWorkoutPrompt;
  parseHistoryAwareAiWorkoutProposalJson?: typeof parseHistoryAwareAiWorkoutProposalJson;
  confirmationSecret?: string;
  now?: () => Date;
}

export async function saveAiPlannedWorkout(
  client: WorkoutClient,
  userId: string | null,
  request: AiWorkoutSaveRequest,
): Promise<AiGenerationResult<{ workoutId: string }>> {
  if (!userId) return failure("unauthenticated", "service", "AUTH_MISSING");

  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();
  if (authError || user?.id !== userId) {
    return failure("unauthenticated", "service", authError ? "AUTH_LOOKUP_FAILED" : "AUTH_MISMATCH");
  }

  const requestedIds = request.exercises.map(({ exerciseId }) => exerciseId);
  const { data: knownExercises, error: catalogueError } = await client
    .from("exercises")
    .select("id")
    .in("id", requestedIds)
    .limit(20);
  if (catalogueError) return failure("persistence_failed", "database", catalogueError.code);
  if (!validateDraftItems(request.exercises, new Set(knownExercises.map(({ id }) => id)))) {
    return failure("validation_failed", "service", "CATALOGUE_MISMATCH");
  }

  const exercises: Json = request.exercises.map(({ exerciseId, sets, reps }) => ({
    exercise_id: exerciseId,
    sets,
    reps,
  }));
  let replacementArgs: SaveAiPlannedWorkoutReplacementArgs;
  if (request.replaceExisting) {
    const { expectedWorkoutId, expectedRevision } = request;
    if (expectedWorkoutId === null || expectedRevision === null) {
      return failure("validation_failed", "service", "EXPECTED_PLAN_MISSING");
    }
    replacementArgs = {
      p_replace_existing: true,
      p_expected_workout_id: expectedWorkoutId,
      p_expected_revision: expectedRevision,
    };
  } else {
    replacementArgs = { p_replace_existing: false };
  }
  let data: string | null;
  let error: { code: string } | null;

  if (request.proposalId === null) {
    ({ data, error } = await client.rpc("save_ai_planned_workout", {
      p_exercises: exercises,
      ...replacementArgs,
    }));
  } else {
    ({ data, error } = await client.rpc("save_history_aware_ai_planned_workout", {
      p_exercises: exercises,
      p_proposal_id: request.proposalId,
      ...replacementArgs,
    }));
  }
  if (error) {
    const codes: Partial<Record<string, AiGenerationErrorCode>> = {
      AW001: "confirmation_required",
      AW002: "stale_plan",
      AW003: "validation_failed",
      AW004: "unauthenticated",
    };
    const code = codes[error.code];
    return failure(code ?? "persistence_failed", "database", code ? error.code : "UNKNOWN_SQLSTATE");
  }
  if (!data) return failure("persistence_failed", "database", "EMPTY_RPC_RESULT");
  return { ok: true, data: { workoutId: data } };
}

function failure(code: AiGenerationErrorCode, layer: WorkoutFailureLayer, technicalCode: string): AiGenerationFailure {
  const sanitized = workoutFailure("persistence_failed", layer, technicalCode);
  return { ok: false, code, internal: sanitized.internal };
}

function mapWorkoutFailure(value: WorkoutFailure): AiGenerationFailure {
  const code: AiGenerationErrorCode = value.code === "unauthenticated" ? "unauthenticated" : "persistence_failed";
  return { ok: false, code, internal: value.internal };
}

function isConfiguredModel(model: string | undefined): model is string {
  return typeof model === "string" && model.trim().length > 0;
}

const COLD_START_PROVIDER_CODES: Record<OpenRouterFailureCode, AiGenerationErrorCode> = {
  invalid_credential: "key_rejected",
  rate_limited: "rate_limited",
  timeout: "timeout",
  provider_unavailable: "provider_unavailable",
  network_failure: "provider_unavailable",
  response_too_large: "invalid_output",
  malformed_response: "invalid_output",
  invalid_completion: "invalid_output",
};

function coldStartCredentialFailure(reason: string): AiGenerationFailure {
  if (reason === "not_configured") return failure("key_not_configured", "service", "KEY_NOT_CONFIGURED");
  if (reason === "unavailable_encryption") {
    return failure("key_encryption_unavailable", "service", "KEY_ENCRYPTION_UNAVAILABLE");
  }
  return failure(
    reason === "unauthenticated" ? "unauthenticated" : "persistence_failed",
    reason === "persistence_failure" ? "database" : "service",
    reason === "persistence_failure" ? "KEY_LOOKUP_FAILED" : "AUTH_MISSING",
  );
}

function historyAwareCredentialFailure(reason: string): AiGenerationFailure {
  return failure(
    reason === "not_configured" ? "key_not_configured" : "persistence_failed",
    "service",
    "KEY_UNAVAILABLE",
  );
}

function historyAwareProviderFailure(code: OpenRouterFailureCode): AiGenerationFailure {
  return failure(code === "timeout" ? "timeout" : "provider_unavailable", "service", `PROVIDER_${code.toUpperCase()}`);
}

/** Every re-roll item and exclusion must name a catalogue exercise from this request's own catalogue load. */
function validateRerollCatalogue(
  reroll: AiWorkoutReroll,
  catalogue: readonly CatalogueExercise[],
): AiGenerationFailure | null {
  const known = new Set(catalogue.map(({ id }) => id));
  const ids = [...reroll.exercises.map(({ exerciseId }) => exerciseId), ...rerollExcludedIds(reroll)];
  return ids.every((id) => known.has(id)) ? null : failure("validation_failed", "service", "REROLL_UNKNOWN_EXERCISE");
}

function isPartialReroll(reroll: AiWorkoutReroll | undefined): reroll is AiWorkoutReroll {
  return reroll !== undefined && !isFullReroll(reroll);
}

function notFeasible(plan: Extract<PartialRerollPlan, { kind: "not_feasible" }>): AiGenerationFailure {
  return failure("replacement_not_feasible", "service", `REROLL_${plan.reason.toUpperCase()}`);
}

interface PartialRerollContext {
  items: AiWorkoutReroll["exercises"];
  kept: ReturnType<typeof rerollKeptItems>;
  keptIds: string[];
  markedIds: string[];
  excludedIds: string[];
  keptExercises: CatalogueExercise[];
  catalogueById: Map<string, CatalogueExercise>;
}

function partialRerollContext(reroll: AiWorkoutReroll, catalogue: readonly CatalogueExercise[]): PartialRerollContext {
  const catalogueById = new Map(catalogue.map((exercise) => [exercise.id, exercise]));
  const kept = rerollKeptItems(reroll);
  const keptIds = kept.map(({ exerciseId }) => exerciseId);
  return {
    items: reroll.exercises,
    kept,
    keptIds,
    markedIds: rerollMarkedIds(reroll),
    excludedIds: rerollExcludedIds(reroll),
    keptExercises: keptIds.flatMap((id) => catalogueById.get(id) ?? []),
    catalogueById,
  };
}

function coverageMissing(
  required: readonly RecommendationCoverage[],
  provided: readonly RecommendationCoverage[],
): RecommendationCoverage[] {
  return required.filter((coverage) => !provided.includes(coverage));
}

function coverageAvailable(
  missing: readonly RecommendationCoverage[],
  exercises: readonly CatalogueExercise[],
): boolean {
  return missing.every((coverage) => exercises.some((exercise) => coverageOf(exercise).includes(coverage)));
}

interface ReducedConfirmationInput {
  client: WorkoutClient;
  userId: string;
  command: AiWorkoutGenerationCommand;
  fingerprint: string;
  allowedCount: 3 | 4;
  dependencies: AiWorkoutGenerationDependencies;
  now: Date;
}

/**
 * Reduced-size handshake: without a token, register a fresh owner-bound confirmation and stop; with a token, verify it
 * against the freshly recomputed fingerprint and consume it once. Returns null only when the token was consumed.
 */
async function confirmReducedGeneration({
  client,
  userId,
  command,
  fingerprint,
  allowedCount,
  dependencies,
  now,
}: ReducedConfirmationInput): Promise<AiGenerationFailure | null> {
  if (command.confirmationToken === undefined) {
    const nonce = crypto.randomUUID();
    const token = await createReducedGenerationConfirmation(
      {
        ownerId: userId,
        candidateFingerprint: fingerprint,
        allowedCount,
        expiresAt: now.getTime() + 5 * 60_000,
        nonce,
      },
      dependencies.confirmationSecret,
    );
    if (!token) return failure("persistence_failed", "service", "CONFIRMATION_SECRET_MISSING");
    const { error } = await client.rpc("register_ai_reduced_generation_confirmation", {
      p_nonce_digest: await digestConfirmationNonce(nonce),
      p_candidate_fingerprint: fingerprint,
      p_allowed_count: allowedCount,
    });
    if (error) return failure("persistence_failed", "database", error.code);
    return {
      ok: false,
      code: "confirmation_required",
      internal: { layer: "service", technicalCode: "CONFIRMATION_REQUIRED" },
      confirmation: { availableExerciseCount: allowedCount, token },
    };
  }
  const confirmation = await verifyReducedGenerationConfirmation(
    command.confirmationToken,
    dependencies.confirmationSecret,
    now.getTime(),
  );
  if (!confirmation) return failure("stale_confirmation", "service", "CONFIRMATION_INVALID");
  if (
    confirmation.ownerId !== userId ||
    confirmation.candidateFingerprint !== fingerprint ||
    confirmation.allowedCount !== allowedCount
  )
    return failure("stale_confirmation", "service", "CONFIRMATION_INVALID");
  const { error } = await client.rpc("consume_ai_reduced_generation_confirmation", {
    p_nonce_digest: await digestConfirmationNonce(confirmation.nonce),
    p_candidate_fingerprint: fingerprint,
    p_allowed_count: confirmation.allowedCount,
  });
  if (error) return failure("stale_confirmation", "database", error.code);
  return null;
}

async function recordHistoryAwareProposal(
  client: WorkoutClient,
  command: AiWorkoutGenerationCommand,
  exerciseIds: string[],
): Promise<AiGenerationResult<string>> {
  const { data, error } =
    command.priorProposalId !== undefined
      ? await client.rpc("record_ai_workout_proposal", {
          p_exercise_ids: exerciseIds,
          p_rerolled_from_proposal_id: command.priorProposalId,
        })
      : await client.rpc("record_ai_workout_proposal", { p_exercise_ids: exerciseIds });
  if (error || !data[0]) return failure("persistence_failed", "database", error ? error.code : "EMPTY_PROPOSAL_RECORD");
  return { ok: true, data: data[0].proposal_id };
}

function historyAwareResult(
  proposal: AiWorkoutProposal,
  proposalId: string,
  preferences: HistoryAwareAiProfile["preferences"],
): AiGenerationResult<GeneratedAiWorkout> {
  const exerciseIds = proposal.exercises.map(({ exerciseId }) => exerciseId);
  return {
    ok: true,
    data: {
      proposal,
      metadata: {
        kind: "history_aware",
        proposalId,
        exerciseCount: proposal.exercises.length,
        reduced: proposal.exercises.length < 5,
        originalExerciseIds: exerciseIds,
        preferences: Object.fromEntries(
          exerciseIds.map((id) => [id, preferences.get(id) === "liked" ? "liked" : "neutral"] as const),
        ),
      },
    },
  };
}

export async function generateColdStartAiWorkout(
  client: WorkoutClient,
  userId: string | null,
  model: string | undefined,
  dependencies: AiWorkoutGenerationDependencies,
  command: AiWorkoutGenerationCommand = { version: 1 },
): Promise<AiGenerationResult<GeneratedAiWorkout>> {
  const eligibility = await dependencies.loadColdStartEligibility(client, userId);
  if (!eligibility.ok) return mapWorkoutFailure(eligibility);
  if (eligibility.data === "history_aware_not_available") {
    if (!dependencies.loadHistoryAwareAiProfile)
      return failure("history_aware_not_available", "service", "COMPLETED_HISTORY_EXISTS");
    return generateHistoryAwareAiWorkout(client, userId, model, command, dependencies);
  }

  if (!isConfiguredModel(model)) return failure("model_not_configured", "service", "MODEL_NOT_CONFIGURED");

  // Re-roll commands are validated against the catalogue before any credential is decrypted.
  let rerollCatalogue: CatalogueExercise[] | null = null;
  if (command.reroll) {
    const catalogue = await dependencies.loadWorkoutCatalogue(client);
    if (!catalogue.ok) return mapWorkoutFailure(catalogue);
    const unknown = validateRerollCatalogue(command.reroll, catalogue.data);
    if (unknown) return unknown;
    if (isPartialReroll(command.reroll))
      return generateColdStartPartialReroll(client, userId, model, command.reroll, catalogue.data, dependencies);
    rerollCatalogue = catalogue.data;
  }

  const credential = await dependencies.decryptOwnedAiProviderKey(client, userId);
  if (!credential.ok) return coldStartCredentialFailure(credential.reason);

  let catalogueData = rerollCatalogue;
  if (!catalogueData) {
    const catalogue = await dependencies.loadWorkoutCatalogue(client);
    if (!catalogue.ok) return mapWorkoutFailure(catalogue);
    catalogueData = catalogue.data;
  }

  const prompt = dependencies.buildColdStartWorkoutPrompt(catalogueData);
  if (!prompt.ok) return failure("catalogue_context_too_large", "service", "CATALOGUE_CONTEXT_TOO_LARGE");

  const provider = await dependencies.requestOpenRouterWorkout({
    apiKey: credential.data,
    model: model.trim(),
    prompt: prompt.data,
    allowedExerciseIds: catalogueData.map(({ id }) => id),
    requestedExerciseCount: { min: 5, max: 7 },
  });
  if (!provider.ok) {
    return failure(COLD_START_PROVIDER_CODES[provider.code], "service", `PROVIDER_${provider.code.toUpperCase()}`);
  }

  const proposal = dependencies.parseAiWorkoutProposalJson(provider.data.content, catalogueData);
  if (!proposal.ok) return failure("invalid_output", "service", `PROPOSAL_${proposal.code.toUpperCase()}`);
  return {
    ok: true,
    data: { proposal: proposal.data, metadata: { kind: "cold_start", exerciseCount: proposal.data.exercises.length } },
  };
}

async function generateColdStartPartialReroll(
  client: WorkoutClient,
  userId: string | null,
  model: string,
  reroll: AiWorkoutReroll,
  catalogue: readonly CatalogueExercise[],
  dependencies: AiWorkoutGenerationDependencies,
): Promise<AiGenerationResult<GeneratedAiWorkout>> {
  const context = partialRerollContext(reroll, catalogue);
  const removed = new Set([...context.keptIds, ...context.markedIds, ...context.excludedIds]);
  const pool = catalogue.filter(({ id }) => !removed.has(id));
  const requiredCoverage = [...RECOMMENDATION_COVERAGES];
  const keptCoverage = [...new Set(context.keptExercises.flatMap(coverageOf))];
  const missingCoverage = coverageMissing(requiredCoverage, keptCoverage);
  const plan = planPartialReroll({
    mode: "cold_start",
    keptCount: context.kept.length,
    markedCount: context.markedIds.length,
    poolCount: pool.length,
    pickableCount: pool.length,
    missingCoverageCount: missingCoverage.length,
    missingCoverageFeasible: coverageAvailable(missingCoverage, pool),
  });
  if (plan.kind === "not_feasible") return notFeasible(plan);
  if (plan.kind !== "normal") return failure("replacement_not_feasible", "service", "REROLL_POOL_TOO_SMALL");

  const credential = await dependencies.decryptOwnedAiProviderKey(client, userId);
  if (!credential.ok) return coldStartCredentialFailure(credential.reason);

  const prompt = buildPartialRerollPrompt({
    mode: "cold_start",
    kept: context.keptExercises,
    candidates: pool,
    missingCoverage,
    requiredCoverage,
    newCount: plan.newCount,
  });
  if (!prompt.ok) return failure("catalogue_context_too_large", "service", "CATALOGUE_CONTEXT_TOO_LARGE");

  const poolIds = pool.map(({ id }) => id);
  const provider = await dependencies.requestOpenRouterWorkout({
    apiKey: credential.data,
    model: model.trim(),
    prompt: prompt.data,
    allowedExerciseIds: poolIds,
    requestedExerciseCount: plan.newCount,
  });
  if (!provider.ok) {
    return failure(COLD_START_PROVIDER_CODES[provider.code], "service", `PROVIDER_${provider.code.toUpperCase()}`);
  }

  const picks = parsePartialRerollPicksJson(provider.data.content, {
    allowedIds: poolIds,
    kept: context.kept,
    catalogueById: context.catalogueById,
    requiredCoverage,
    newCount: plan.newCount,
  });
  if (!picks.ok) return failure("invalid_output", "service", `PROPOSAL_${picks.code.toUpperCase()}`);
  const exercises = mergePartialReroll(context.items, picks.data.exercises);
  return {
    ok: true,
    data: { proposal: { exercises }, metadata: { kind: "cold_start", exerciseCount: exercises.length } },
  };
}

export async function generateHistoryAwareAiWorkout(
  client: WorkoutClient,
  userId: string | null,
  model: string | undefined,
  command: AiWorkoutGenerationCommand,
  dependencies: AiWorkoutGenerationDependencies,
): Promise<AiGenerationResult<GeneratedAiWorkout>> {
  if (!userId) return failure("unauthenticated", "service", "AUTH_MISSING");
  if (
    !dependencies.loadHistoryAwareAiProfile ||
    !dependencies.recommendHistoryAwareWorkout ||
    !dependencies.buildHistoryAwareWorkoutPrompt ||
    !dependencies.parseHistoryAwareAiWorkoutProposalJson
  )
    return failure("persistence_failed", "service", "HISTORY_AWARE_DEPENDENCY_MISSING");
  const [profile, catalogue] = await Promise.all([
    dependencies.loadHistoryAwareAiProfile(client, userId),
    dependencies.loadWorkoutCatalogue(client),
  ]);
  if (!profile.ok) return mapWorkoutFailure(profile);
  if (!catalogue.ok) return mapWorkoutFailure(catalogue);
  if (profile.data.completions.length === 0)
    return failure("persistence_failed", "service", "HISTORY_ELIGIBILITY_PROFILE_MISMATCH");
  if (command.reroll) {
    const unknown = validateRerollCatalogue(command.reroll, catalogue.data);
    if (unknown) return unknown;
    if (isPartialReroll(command.reroll)) {
      return generateHistoryAwarePartialReroll({
        client,
        userId,
        model,
        command,
        reroll: command.reroll,
        catalogue: catalogue.data,
        profile: profile.data,
        dependencies,
        recommend: dependencies.recommendHistoryAwareWorkout,
      });
    }
  }
  const recommendation = dependencies.recommendHistoryAwareWorkout({
    catalogue: catalogue.data,
    completions: profile.data.completions,
    preferences: profile.data.preferences,
    now: dependencies.now?.(),
  });
  const ids = recommendation.readyCandidates.map(({ id }) => id);
  if (recommendation.decision.kind === "insufficient_recovered_candidates")
    return failure("insufficient_recovered_candidates", "service", "INSUFFICIENT_READY_CANDIDATES");
  const now = dependencies.now?.() ?? new Date();
  let requested: HistoryAwareRequestedExerciseCount;
  if (recommendation.decision.kind === "reduced_confirmation_required") {
    const allowedCount = recommendation.decision.availableExerciseCount;
    const confirmationFailure = await confirmReducedGeneration({
      client,
      userId,
      command,
      fingerprint: await fingerprintCandidates(ids),
      allowedCount,
      dependencies,
      now,
    });
    if (confirmationFailure) return confirmationFailure;
    requested = allowedCount === 3 ? { min: 3, max: 3 } : { min: 4, max: 4 };
  } else {
    if (command.confirmationToken !== undefined) return failure("stale_confirmation", "service", "REDUCED_NOT_ALLOWED");
    requested = recommendation.decision.requestedExerciseCount;
  }
  if (!isConfiguredModel(model)) return failure("model_not_configured", "service", "MODEL_NOT_CONFIGURED");
  const credential = await dependencies.decryptOwnedAiProviderKey(client, userId);
  if (!credential.ok) return historyAwareCredentialFailure(credential.reason);
  const prompt = dependencies.buildHistoryAwareWorkoutPrompt(recommendation, requested);
  if (!prompt.ok) return failure("catalogue_context_too_large", "service", "CATALOGUE_CONTEXT_TOO_LARGE");
  const provider = await dependencies.requestOpenRouterWorkout({
    apiKey: credential.data,
    model: model.trim(),
    prompt: prompt.data,
    allowedExerciseIds: recommendation.shortlist.map(({ id }) => id),
    requestedExerciseCount: requested,
  });
  if (!provider.ok) return historyAwareProviderFailure(provider.code);
  const proposal = dependencies.parseHistoryAwareAiWorkoutProposalJson(provider.data.content, {
    shortlist: recommendation.shortlist,
    feasibleCoverage: recommendation.feasibleCoverage,
    requestedExerciseCount: requested,
  });
  if (!proposal.ok) return failure("invalid_output", "service", `PROPOSAL_${proposal.code.toUpperCase()}`);
  const recorded = await recordHistoryAwareProposal(
    client,
    command,
    proposal.data.exercises.map(({ exerciseId }) => exerciseId),
  );
  if (!recorded.ok) return recorded;
  return historyAwareResult(proposal.data, recorded.data, profile.data.preferences);
}

interface HistoryAwarePartialRerollInput {
  client: WorkoutClient;
  userId: string;
  model: string | undefined;
  command: AiWorkoutGenerationCommand;
  reroll: AiWorkoutReroll;
  catalogue: readonly CatalogueExercise[];
  profile: HistoryAwareAiProfile;
  dependencies: AiWorkoutGenerationDependencies;
  recommend: typeof recommendHistoryAwareWorkout;
}

async function generateHistoryAwarePartialReroll({
  client,
  userId,
  model,
  command,
  reroll,
  catalogue,
  profile,
  dependencies,
  recommend,
}: HistoryAwarePartialRerollInput): Promise<AiGenerationResult<GeneratedAiWorkout>> {
  const context = partialRerollContext(reroll, catalogue);
  const recommendation = recommend({
    catalogue,
    completions: profile.completions,
    preferences: profile.preferences,
    now: dependencies.now?.(),
    fixedExerciseIds: context.keptIds,
    excludedExerciseIds: [...context.markedIds, ...context.excludedIds],
  });
  const requiredCoverage = recommendation.feasibleCoverage;
  const missingCoverage = coverageMissing(requiredCoverage, recommendation.fixedCoverage);
  // Decide only via the partial plan; the recommender's full-generation decision does not apply after exclusion.
  const plan = planPartialReroll({
    mode: "history_aware",
    keptCount: context.kept.length,
    markedCount: context.markedIds.length,
    poolCount: recommendation.readyCandidates.length,
    pickableCount: recommendation.shortlist.length,
    accountReadyCount: recommendation.accountReadyCount,
    missingCoverageCount: missingCoverage.length,
    missingCoverageFeasible: coverageAvailable(missingCoverage, recommendation.shortlist),
  });
  if (plan.kind === "not_feasible") return notFeasible(plan);
  if (plan.kind === "reduced_confirmation_required") {
    const confirmationFailure = await confirmReducedGeneration({
      client,
      userId,
      command,
      fingerprint: await fingerprintPartialReroll({
        candidateIds: recommendation.readyCandidates.map(({ id }) => id),
        keptIds: context.keptIds,
        markedIds: context.markedIds,
        excludedIds: context.excludedIds,
      }),
      allowedCount: plan.mergedSize,
      dependencies,
      now: dependencies.now?.() ?? new Date(),
    });
    if (confirmationFailure) return confirmationFailure;
  } else if (command.confirmationToken !== undefined) {
    return failure("stale_confirmation", "service", "REDUCED_NOT_ALLOWED");
  }

  if (!isConfiguredModel(model)) return failure("model_not_configured", "service", "MODEL_NOT_CONFIGURED");
  const credential = await dependencies.decryptOwnedAiProviderKey(client, userId);
  if (!credential.ok) return historyAwareCredentialFailure(credential.reason);
  const prompt = buildPartialRerollPrompt({
    mode: "history_aware",
    kept: context.keptExercises,
    candidates: recommendation.shortlist,
    missingCoverage,
    requiredCoverage,
    newCount: plan.newCount,
  });
  if (!prompt.ok) return failure("catalogue_context_too_large", "service", "CATALOGUE_CONTEXT_TOO_LARGE");
  const shortlistIds = recommendation.shortlist.map(({ id }) => id);
  const provider = await dependencies.requestOpenRouterWorkout({
    apiKey: credential.data,
    model: model.trim(),
    prompt: prompt.data,
    allowedExerciseIds: shortlistIds,
    requestedExerciseCount: plan.newCount,
  });
  if (!provider.ok) return historyAwareProviderFailure(provider.code);
  const picks = parsePartialRerollPicksJson(provider.data.content, {
    allowedIds: shortlistIds,
    kept: context.kept,
    catalogueById: context.catalogueById,
    requiredCoverage,
    newCount: plan.newCount,
    neverCompletedIds: recommendation.neverCompletedIds,
    explorationBudget: recommendation.explorationBudget,
  });
  if (!picks.ok) return failure("invalid_output", "service", `PROPOSAL_${picks.code.toUpperCase()}`);
  const exercises = mergePartialReroll(context.items, picks.data.exercises);
  const recorded = await recordHistoryAwareProposal(
    client,
    command,
    exercises.map(({ exerciseId }) => exerciseId),
  );
  if (!recorded.ok) return recorded;
  return historyAwareResult({ exercises }, recorded.data, profile.preferences);
}
