import type { APIRoute } from "astro";
import { parseManualWorkoutRequest } from "@/lib/manual-workout-builder";
import { saveManualPlannedWorkout } from "@/lib/manual-workouts";
import {
  failureResponse,
  parseJsonBody,
  requireAuthenticatedLocals,
  requireSameOrigin,
  successJson,
} from "@/lib/workout-api";
import { setToastStatus } from "@/lib/toast-notifications";

export const POST: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const operation = "save_manual_workout" as const;
  const originFailure = requireSameOrigin(context, requestId, operation);
  if (originFailure) return originFailure;

  const parsedBody = await parseJsonBody(context, requestId, operation);
  if (!parsedBody.ok) return parsedBody.response;
  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;
  const { supabase, user } = context.locals;
  if (!supabase || !user)
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");

  const validation = parseManualWorkoutRequest(parsedBody.value);
  if (!validation.valid)
    return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_SCHEMA");

  const result = await saveManualPlannedWorkout(supabase, user.id, validation.value);
  if (!result.ok) {
    return failureResponse(requestId, operation, result.code, result.internal.layer, result.internal.technicalCode);
  }

  setToastStatus(context.cookies, "workout-saved", context.url.protocol === "https:");
  return successJson(requestId, { saved: true }, 201);
};
