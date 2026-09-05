import type { AiGenerationErrorCode, AiGenerationFailure } from "./ai-workouts.ts";
import type { WorkoutApiOperation } from "./workout-api.ts";

export type AiGenerationFailureLayer = "request" | "validation" | "service" | "database";

function statusForAiGeneration(code: AiGenerationErrorCode): number {
  const statuses: Record<AiGenerationErrorCode, number> = {
    validation_failed: 400,
    unauthenticated: 401,
    origin_rejected: 403,
    confirmation_required: 409,
    stale_plan: 409,
    history_aware_not_available: 409,
    key_not_configured: 409,
    key_encryption_unavailable: 503,
    key_rejected: 422,
    rate_limited: 429,
    timeout: 504,
    provider_unavailable: 503,
    invalid_output: 502,
    catalogue_context_too_large: 500,
    model_not_configured: 503,
    persistence_failed: 500,
  };
  return statuses[code];
}

function logAiGenerationFailure(
  requestId: string,
  operation: WorkoutApiOperation,
  layer: AiGenerationFailureLayer,
  code: AiGenerationErrorCode,
  technicalCode: string,
  elapsedMs: number,
): void {
  // Diagnostics deliberately exclude payloads, identifiers, prompts, credentials, and provider responses.
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ requestId, operation, layer, code, technicalCode, elapsedMs }));
}

export function aiGenerationFailureResponse(
  requestId: string,
  operation: WorkoutApiOperation,
  failure: AiGenerationFailure,
  elapsedMs: number,
): Response {
  logAiGenerationFailure(
    requestId,
    operation,
    failure.internal.layer,
    failure.code,
    failure.internal.technicalCode,
    elapsedMs,
  );
  return new Response(JSON.stringify({ code: failure.code, requestId }), {
    status: statusForAiGeneration(failure.code),
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Request-ID": requestId },
  });
}

export function aiGenerationSuccessResponse(requestId: string, proposal: { exercises: unknown[] }): Response {
  return new Response(
    JSON.stringify({
      proposal,
      metadata: { kind: "cold_start", exerciseCount: proposal.exercises.length },
      requestId,
    }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "X-Request-ID": requestId } },
  );
}
