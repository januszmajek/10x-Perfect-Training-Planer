import type { APIRoute } from "astro";
import {
  parsePlannedWorkoutCompleteRequest,
  parsePlannedWorkoutDeleteRequest,
  parsePlannedWorkoutUpdateRequest,
} from "@/lib/planned-workout-mutation";
import {
  completePlannedWorkout,
  deletePlannedWorkout,
  loadCurrentPlannedWorkout,
  loadExpectedWorkoutState,
  updatePlannedWorkout,
} from "@/lib/planned-workouts";
import { isCanonicalUuid } from "@/lib/manual-workout-builder";
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

  const expectedWorkoutId = context.url.searchParams.get("expectedWorkoutId");
  if (expectedWorkoutId !== null && !isCanonicalUuid(expectedWorkoutId)) {
    return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_EXPECTED_WORKOUT_ID");
  }

  const currentPlanResult = await loadCurrentPlannedWorkout(supabase, user.id);
  if (!currentPlanResult.ok) {
    return failureResponse(
      requestId,
      operation,
      currentPlanResult.code,
      currentPlanResult.internal.layer,
      currentPlanResult.internal.technicalCode,
    );
  }
  if (expectedWorkoutId === null) return successJson(requestId, { currentPlan: currentPlanResult.data });

  const expectedWorkoutStateResult = await loadExpectedWorkoutState(supabase, user.id, expectedWorkoutId);
  if (!expectedWorkoutStateResult.ok) {
    return failureResponse(
      requestId,
      operation,
      expectedWorkoutStateResult.code,
      expectedWorkoutStateResult.internal.layer,
      expectedWorkoutStateResult.internal.technicalCode,
    );
  }
  return successJson(requestId, {
    currentPlan: currentPlanResult.data,
    expectedWorkoutState: expectedWorkoutStateResult.data,
  });
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

export const PATCH: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const operation = "complete_planned_workout" as const;
  const originFailure = requireSameOrigin(context, requestId, operation);
  if (originFailure) return originFailure;
  const parsedBody = await parseJsonBody(context, requestId, operation);
  if (!parsedBody.ok) return parsedBody.response;
  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;
  const { supabase, user } = context.locals;
  if (!supabase || !user)
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");

  const validation = parsePlannedWorkoutCompleteRequest(parsedBody.value);
  if (!validation.valid)
    return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_SCHEMA");
  const result = await completePlannedWorkout(supabase, user.id, validation.value);
  if (!result.ok) {
    return failureResponse(requestId, operation, result.code, result.internal.layer, result.internal.technicalCode);
  }
  return new Response(null, { status: 204, headers: { "X-Request-ID": requestId } });
};
