import {
  parseAiWorkoutProposalJson,
  parseHistoryAwareAiWorkoutProposalJson,
  type AiWorkoutProposal,
  type HistoryAwareRequestedExerciseCount,
} from "./ai-workout-contract.ts";
import { buildColdStartWorkoutPrompt, buildHistoryAwareWorkoutPrompt } from "./ai-workout-prompt.ts";
import { requestOpenRouterWorkout } from "./openrouter-client.ts";
import { validateDraftItems } from "./manual-workout-builder.ts";
import {
  loadColdStartEligibility,
  loadWorkoutCatalogue,
  workoutFailure,
  type WorkoutFailure,
  type WorkoutFailureLayer,
} from "./planned-workouts.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import { loadHistoryAwareAiProfile } from "./history-aware-ai-profile.ts";
import { recommendHistoryAwareWorkout } from "./ai-workout-recommender.ts";
import {
  createReducedGenerationConfirmation,
  digestConfirmationNonce,
  fingerprintCandidates,
  verifyReducedGenerationConfirmation,
} from "./ai-workout-confirmation.ts";
import type { AiWorkoutGenerationCommand, AiWorkoutGenerationMetadata } from "./ai-workout-client.ts";
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

  const credential = await dependencies.decryptOwnedAiProviderKey(client, userId);
  if (!credential.ok) {
    if (credential.reason === "not_configured") return failure("key_not_configured", "service", "KEY_NOT_CONFIGURED");
    if (credential.reason === "unavailable_encryption") {
      return failure("key_encryption_unavailable", "service", "KEY_ENCRYPTION_UNAVAILABLE");
    }
    return failure(
      credential.reason === "unauthenticated" ? "unauthenticated" : "persistence_failed",
      credential.reason === "persistence_failure" ? "database" : "service",
      credential.reason === "persistence_failure" ? "KEY_LOOKUP_FAILED" : "AUTH_MISSING",
    );
  }

  const catalogue = await dependencies.loadWorkoutCatalogue(client);
  if (!catalogue.ok) return mapWorkoutFailure(catalogue);

  const prompt = dependencies.buildColdStartWorkoutPrompt(catalogue.data);
  if (!prompt.ok) return failure("catalogue_context_too_large", "service", "CATALOGUE_CONTEXT_TOO_LARGE");

  const provider = await dependencies.requestOpenRouterWorkout({
    apiKey: credential.data,
    model: model.trim(),
    prompt: prompt.data,
    allowedExerciseIds: catalogue.data.map(({ id }) => id),
    requestedExerciseCount: { min: 5, max: 7 },
  });
  if (!provider.ok) {
    const codes: Record<typeof provider.code, AiGenerationErrorCode> = {
      invalid_credential: "key_rejected",
      rate_limited: "rate_limited",
      timeout: "timeout",
      provider_unavailable: "provider_unavailable",
      network_failure: "provider_unavailable",
      response_too_large: "invalid_output",
      malformed_response: "invalid_output",
      invalid_completion: "invalid_output",
    };
    return failure(codes[provider.code], "service", `PROVIDER_${provider.code.toUpperCase()}`);
  }

  const proposal = dependencies.parseAiWorkoutProposalJson(provider.data.content, catalogue.data);
  if (!proposal.ok) return failure("invalid_output", "service", `PROPOSAL_${proposal.code.toUpperCase()}`);
  return {
    ok: true,
    data: { proposal: proposal.data, metadata: { kind: "cold_start", exerciseCount: proposal.data.exercises.length } },
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
    const fingerprint = await fingerprintCandidates(ids);
    if (!("confirmationToken" in command)) {
      const nonce = crypto.randomUUID();
      const token = await createReducedGenerationConfirmation(
        {
          ownerId: userId,
          candidateFingerprint: fingerprint,
          allowedCount: recommendation.decision.availableExerciseCount,
          expiresAt: now.getTime() + 5 * 60_000,
          nonce,
        },
        dependencies.confirmationSecret,
      );
      if (!token) return failure("persistence_failed", "service", "CONFIRMATION_SECRET_MISSING");
      const { error } = await client.rpc("register_ai_reduced_generation_confirmation", {
        p_nonce_digest: await digestConfirmationNonce(nonce),
        p_candidate_fingerprint: fingerprint,
        p_allowed_count: recommendation.decision.availableExerciseCount,
      });
      if (error) return failure("persistence_failed", "database", error.code);
      return {
        ok: false,
        code: "confirmation_required",
        internal: { layer: "service", technicalCode: "CONFIRMATION_REQUIRED" },
        confirmation: { availableExerciseCount: recommendation.decision.availableExerciseCount, token },
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
      confirmation.allowedCount !== recommendation.decision.availableExerciseCount
    )
      return failure("stale_confirmation", "service", "CONFIRMATION_INVALID");
    const { error } = await client.rpc("consume_ai_reduced_generation_confirmation", {
      p_nonce_digest: await digestConfirmationNonce(confirmation.nonce),
      p_candidate_fingerprint: fingerprint,
      p_allowed_count: confirmation.allowedCount,
    });
    if (error) return failure("stale_confirmation", "database", error.code);
    requested = recommendation.decision.availableExerciseCount === 3 ? { min: 3, max: 3 } : { min: 4, max: 4 };
  } else {
    if ("confirmationToken" in command) return failure("stale_confirmation", "service", "REDUCED_NOT_ALLOWED");
    requested = recommendation.decision.requestedExerciseCount;
  }
  if (!isConfiguredModel(model)) return failure("model_not_configured", "service", "MODEL_NOT_CONFIGURED");
  const credential = await dependencies.decryptOwnedAiProviderKey(client, userId);
  if (!credential.ok)
    return failure(
      credential.reason === "not_configured" ? "key_not_configured" : "persistence_failed",
      "service",
      "KEY_UNAVAILABLE",
    );
  const prompt = dependencies.buildHistoryAwareWorkoutPrompt(recommendation, requested);
  if (!prompt.ok) return failure("catalogue_context_too_large", "service", "CATALOGUE_CONTEXT_TOO_LARGE");
  const provider = await dependencies.requestOpenRouterWorkout({
    apiKey: credential.data,
    model: model.trim(),
    prompt: prompt.data,
    allowedExerciseIds: recommendation.shortlist.map(({ id }) => id),
    requestedExerciseCount: requested,
  });
  if (!provider.ok)
    return failure(
      provider.code === "timeout" ? "timeout" : "provider_unavailable",
      "service",
      `PROVIDER_${provider.code.toUpperCase()}`,
    );
  const proposal = dependencies.parseHistoryAwareAiWorkoutProposalJson(provider.data.content, {
    shortlist: recommendation.shortlist,
    feasibleCoverage: recommendation.feasibleCoverage,
    requestedExerciseCount: requested,
  });
  if (!proposal.ok) return failure("invalid_output", "service", `PROPOSAL_${proposal.code.toUpperCase()}`);
  const proposalExerciseIds = proposal.data.exercises.map(({ exerciseId }) => exerciseId);
  const { data, error } =
    "priorProposalId" in command
      ? await client.rpc("record_ai_workout_proposal", {
          p_exercise_ids: proposalExerciseIds,
          p_rerolled_from_proposal_id: command.priorProposalId,
        })
      : await client.rpc("record_ai_workout_proposal", { p_exercise_ids: proposalExerciseIds });
  if (error || !data[0]) return failure("persistence_failed", "database", error ? error.code : "EMPTY_PROPOSAL_RECORD");
  const preferences = Object.fromEntries(
    proposal.data.exercises.map(
      ({ exerciseId }) =>
        [exerciseId, profile.data.preferences.get(exerciseId) === "liked" ? "liked" : "neutral"] as const,
    ),
  );
  return {
    ok: true,
    data: {
      proposal: proposal.data,
      metadata: {
        kind: "history_aware",
        proposalId: data[0].proposal_id,
        exerciseCount: proposal.data.exercises.length,
        reduced: requested.max < 5,
        originalExerciseIds: proposal.data.exercises.map(({ exerciseId }) => exerciseId),
        preferences,
      },
    },
  };
}
