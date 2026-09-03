import type { APIContext } from "astro";
import type { WorkoutErrorCode, WorkoutFailureLayer } from "@/lib/planned-workouts";

export const MAX_WORKOUT_REQUEST_BYTES = 32 * 1024;

export type WorkoutApiOperation =
  | "get_current_plan"
  | "get_completed_history"
  | "save_manual_workout"
  | "update_planned_workout"
  | "delete_planned_workout"
  | "complete_planned_workout";
type RequestFailureLayer = "request" | "validation" | WorkoutFailureLayer;

function statusFor(code: WorkoutErrorCode): number {
  const statuses: Record<WorkoutErrorCode, number> = {
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
  operation: WorkoutApiOperation,
  layer: RequestFailureLayer,
  code: WorkoutErrorCode,
  technicalCode: string,
): void {
  // Diagnostics deliberately exclude payloads, identifiers, raw errors, cookies, and user data.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ requestId, operation, layer, code, technicalCode }));
}

export function failureResponse(
  requestId: string,
  operation: WorkoutApiOperation,
  code: WorkoutErrorCode,
  layer: RequestFailureLayer,
  technicalCode: string,
): Response {
  logFailure(requestId, operation, layer, code, technicalCode);
  return new Response(JSON.stringify({ code, requestId }), {
    status: statusFor(code),
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Request-ID": requestId },
  });
}

export function successJson(requestId: string, value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Request-ID": requestId },
  });
}

export function requireAuthenticatedLocals(
  context: APIContext,
  requestId: string,
  operation: WorkoutApiOperation,
): Response | null {
  if (!context.locals.user || !context.locals.supabase) {
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");
  }
  return null;
}

export function requireSameOrigin(
  context: APIContext,
  requestId: string,
  operation: WorkoutApiOperation,
): Response | null {
  if (context.request.headers.get("Origin") !== context.url.origin) {
    return failureResponse(requestId, operation, "origin_rejected", "request", "ORIGIN_REJECTED");
  }
  return null;
}

export async function parseJsonBody(
  context: APIContext,
  requestId: string,
  operation: WorkoutApiOperation,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  const contentType = context.request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return {
      ok: false,
      response: failureResponse(requestId, operation, "validation_failed", "request", "MEDIA_TYPE_REJECTED"),
    };
  }

  const declaredLength = context.request.headers.get("Content-Length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_WORKOUT_REQUEST_BYTES) {
      return {
        ok: false,
        response: failureResponse(requestId, operation, "validation_failed", "request", "CONTENT_LENGTH_REJECTED"),
      };
    }
  }

  try {
    const body = await context.request.arrayBuffer();
    if (body.byteLength > MAX_WORKOUT_REQUEST_BYTES) {
      return {
        ok: false,
        response: failureResponse(requestId, operation, "validation_failed", "request", "BODY_TOO_LARGE"),
      };
    }
    return { ok: true, value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) };
  } catch {
    return {
      ok: false,
      response: failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_JSON"),
    };
  }
}
