import type { APIRoute } from "astro";
import { parseAiWorkoutPreferenceRequest } from "@/lib/ai-workout-feedback-client";
import {
  failureResponse,
  parseJsonBody,
  requireAuthenticatedLocals,
  requireSameOrigin,
  successJson,
} from "@/lib/workout-api";

export const POST: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const operation = "set_ai_workout_preference" as const;
  const originFailure = requireSameOrigin(context, requestId, operation);
  if (originFailure) return originFailure;

  const parsedBody = await parseJsonBody(context, requestId, operation);
  if (!parsedBody.ok) return parsedBody.response;
  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;
  const { supabase } = context.locals;
  if (!supabase) return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");
  const preference = parseAiWorkoutPreferenceRequest(parsedBody.value);
  if (!preference) return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_SCHEMA");

  const { error } = await supabase.rpc(
    "set_ai_exercise_preference",
    preference.preference === null
      ? { p_exercise_id: preference.exerciseId }
      : { p_exercise_id: preference.exerciseId, p_preference: preference.preference },
  );
  if (error) return failureResponse(requestId, operation, "persistence_failed", "database", "PREFERENCE_WRITE_FAILED");
  return successJson(requestId, { preference: preference.preference });
};
