import { AI_CONFIRMATION_SIGNING_SECRET, OPENROUTER_MODEL } from "astro:env/server";
import type { APIRoute } from "astro";
import { decryptOwnedAiProviderKey } from "@/lib/ai-provider-keys";
import { aiGenerationFailureResponse, aiGenerationSuccessResponse } from "@/lib/ai-workout-api";
import { parseAiWorkoutGenerationCommand } from "@/lib/ai-workout-client";
import { generateColdStartAiWorkout } from "@/lib/ai-workouts";
import { buildColdStartWorkoutPrompt, buildHistoryAwareWorkoutPrompt } from "@/lib/ai-workout-prompt";
import { requestOpenRouterWorkout } from "@/lib/openrouter-client";
import { failureResponse, parseJsonBody, requireAuthenticatedLocals, requireSameOrigin } from "@/lib/workout-api";
import { loadColdStartEligibility, loadWorkoutCatalogue } from "@/lib/planned-workouts";
import { parseAiWorkoutProposalJson } from "@/lib/ai-workout-contract";
import { parseHistoryAwareAiWorkoutProposalJson } from "@/lib/ai-workout-contract";
import { loadHistoryAwareAiProfile } from "@/lib/history-aware-ai-profile";
import { recommendHistoryAwareWorkout } from "@/lib/ai-workout-recommender";

export const POST: APIRoute = async (context) => {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const operation = "generate_ai_workout" as const;
  const originFailure = requireSameOrigin(context, requestId, operation);
  if (originFailure) return originFailure;

  const parsedBody = await parseJsonBody(context, requestId, operation);
  if (!parsedBody.ok) return parsedBody.response;
  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;
  const { supabase, user } = context.locals;
  if (!supabase || !user) {
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");
  }

  const command = parseAiWorkoutGenerationCommand(parsedBody.value);
  if (!command) {
    return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_SCHEMA");
  }

  const result = await generateColdStartAiWorkout(
    supabase,
    user.id,
    OPENROUTER_MODEL,
    {
      decryptOwnedAiProviderKey,
      loadColdStartEligibility,
      loadWorkoutCatalogue,
      buildColdStartWorkoutPrompt,
      requestOpenRouterWorkout,
      parseAiWorkoutProposalJson,
      loadHistoryAwareAiProfile,
      recommendHistoryAwareWorkout,
      buildHistoryAwareWorkoutPrompt,
      parseHistoryAwareAiWorkoutProposalJson,
      confirmationSecret: AI_CONFIRMATION_SIGNING_SECRET,
    },
    command,
  );
  if (!result.ok) {
    return aiGenerationFailureResponse(requestId, operation, result, Date.now() - startedAt);
  }

  return aiGenerationSuccessResponse(requestId, result.data);
};
