import type { APIRoute } from "astro";
import { parsePlannedWorkoutDeleteRequest, parsePlannedWorkoutUpdateRequest } from "@/lib/planned-workout-mutation";
import { deletePlannedWorkout, loadCurrentPlannedWorkout, updatePlannedWorkout } from "@/lib/planned-workouts";
import {
  failureResponse,
  parseJsonBody,
  requireAuthenticatedLocals,
  requireSameOrigin,
  successJson,
} from "@/lib/workout-api";

export const GET: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const operation = "get_current_plan" as const;
  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;
  const { supabase, user } = context.locals;
  if (!supabase || !user)
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");

  const result = await loadCurrentPlannedWorkout(supabase, user.id);
  if (!result.ok) {
    return failureResponse(requestId, operation, result.code, result.internal.layer, result.internal.technicalCode);
  }
  return successJson(requestId, { currentPlan: result.data });
};

export const PUT: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const operation = "update_planned_workout" as const;
  const originFailure = requireSameOrigin(context, requestId, operation);
  if (originFailure) return originFailure;
  const parsedBody = await parseJsonBody(context, requestId, operation);
  if (!parsedBody.ok) return parsedBody.response;
  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;
  const { supabase, user } = context.locals;
  if (!supabase || !user)
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");

  const validation = parsePlannedWorkoutUpdateRequest(parsedBody.value);
  if (!validation.valid)
    return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_SCHEMA");
  const result = await updatePlannedWorkout(supabase, user.id, validation.value);
  if (!result.ok) {
    return failureResponse(requestId, operation, result.code, result.internal.layer, result.internal.technicalCode);
  }
  return successJson(requestId, result.data);
};

export const DELETE: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const operation = "delete_planned_workout" as const;
  const originFailure = requireSameOrigin(context, requestId, operation);
  if (originFailure) return originFailure;
  const parsedBody = await parseJsonBody(context, requestId, operation);
  if (!parsedBody.ok) return parsedBody.response;
  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;
  const { supabase, user } = context.locals;
  if (!supabase || !user)
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");

  const validation = parsePlannedWorkoutDeleteRequest(parsedBody.value);
  if (!validation.valid)
    return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_SCHEMA");
  const result = await deletePlannedWorkout(supabase, user.id, validation.value);
  if (!result.ok) {
    return failureResponse(requestId, operation, result.code, result.internal.layer, result.internal.technicalCode);
  }
  return new Response(null, { status: 204, headers: { "X-Request-ID": requestId } });
};
