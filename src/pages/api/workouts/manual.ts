import type { APIContext, APIRoute } from "astro";
import { parseManualWorkoutRequest } from "@/lib/manual-workout-builder";
import {
  loadCurrentPlannedWorkout,
  saveManualPlannedWorkout,
  type ManualWorkoutErrorCode,
} from "@/lib/manual-workouts";

const MAX_BODY_BYTES = 32 * 1024;

type FailureLayer = "request" | "validation" | "service" | "database";

function statusFor(code: ManualWorkoutErrorCode): number {
  const statuses: Record<ManualWorkoutErrorCode, number> = {
    validation_failed: 400,
    unauthenticated: 401,
    origin_rejected: 403,
    confirmation_required: 409,
    stale_plan: 409,
    persistence_failed: 500,
  };
  return statuses[code];
}

function logFailure(
  requestId: string,
  operation: "get_current_plan" | "save_manual_workout",
  layer: FailureLayer,
  code: ManualWorkoutErrorCode,
  technicalCode: string,
): void {
  // Structured server diagnostics intentionally exclude payloads, identities, and raw errors.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ requestId, operation, layer, code, technicalCode }));
}

function failureResponse(
  requestId: string,
  operation: "get_current_plan" | "save_manual_workout",
  code: ManualWorkoutErrorCode,
  layer: FailureLayer,
  technicalCode: string,
): Response {
  logFailure(requestId, operation, layer, code, technicalCode);
  return new Response(JSON.stringify({ code, requestId }), {
    status: statusFor(code),
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Request-ID": requestId,
    },
  });
}

function successJson(requestId: string, value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Request-ID": requestId,
    },
  });
}

function requireAuthenticatedLocals(
  context: APIContext,
  requestId: string,
  operation: "get_current_plan" | "save_manual_workout",
): Response | null {
  if (!context.locals.user || !context.locals.supabase) {
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");
  }
  return null;
}

export const GET: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const authFailure = requireAuthenticatedLocals(context, requestId, "get_current_plan");
  if (authFailure) return authFailure;
  const { supabase, user } = context.locals;
  if (!supabase || !user) {
    return failureResponse(requestId, "get_current_plan", "unauthenticated", "request", "AUTH_LOCALS_MISSING");
  }

  const result = await loadCurrentPlannedWorkout(supabase, user.id);
  if (!result.ok) {
    return failureResponse(
      requestId,
      "get_current_plan",
      result.code,
      result.internal.layer,
      result.internal.technicalCode,
    );
  }

  return successJson(requestId, { currentPlan: result.data });
};

export const POST: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const operation = "save_manual_workout" as const;
  const origin = context.request.headers.get("Origin");

  if (origin !== context.url.origin) {
    return failureResponse(requestId, operation, "origin_rejected", "request", "ORIGIN_REJECTED");
  }

  const contentType = context.request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return failureResponse(requestId, operation, "validation_failed", "request", "MEDIA_TYPE_REJECTED");
  }

  const declaredLength = context.request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_BODY_BYTES) {
      return failureResponse(requestId, operation, "validation_failed", "request", "CONTENT_LENGTH_REJECTED");
    }
  }

  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;
  const { supabase, user } = context.locals;
  if (!supabase || !user) {
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");
  }

  let input: unknown;
  try {
    const body = await context.request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) {
      return failureResponse(requestId, operation, "validation_failed", "request", "BODY_TOO_LARGE");
    }
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } catch {
    return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_JSON");
  }

  const validation = parseManualWorkoutRequest(input);
  if (!validation.valid) {
    return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_SCHEMA");
  }

  const result = await saveManualPlannedWorkout(supabase, user.id, validation.value);
  if (!result.ok) {
    return failureResponse(requestId, operation, result.code, result.internal.layer, result.internal.technicalCode);
  }

  return new Response(null, {
    status: 303,
    headers: {
      Location: "/dashboard?status=workout-saved",
      "X-Request-ID": requestId,
    },
  });
};
