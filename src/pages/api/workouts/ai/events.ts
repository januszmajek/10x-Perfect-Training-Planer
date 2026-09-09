import type { APIRoute } from "astro";
import { parseAiWorkoutFeedbackEventRequest } from "@/lib/ai-workout-feedback-client";
import { failureResponse, parseJsonBody, requireAuthenticatedLocals, requireSameOrigin } from "@/lib/workout-api";

export const POST: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const operation = "record_ai_workout_feedback" as const;
  const originFailure = requireSameOrigin(context, requestId, operation);
  if (originFailure) return originFailure;

  const parsedBody = await parseJsonBody(context, requestId, operation);
  if (!parsedBody.ok) return parsedBody.response;
  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;
  const { supabase } = context.locals;
  if (!supabase) return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");
  const event = parseAiWorkoutFeedbackEventRequest(parsedBody.value);
  if (!event) return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_SCHEMA");

  const eventArguments =
    event.type === "exposure"
      ? { p_proposal_id: event.proposalId, p_event_type: "exposure" as const }
      : event.type === "remove"
        ? { p_proposal_id: event.proposalId, p_event_type: "removal" as const, p_exercise_id: event.exerciseId }
        : {
            p_proposal_id: event.proposalId,
            p_event_type: "swap" as const,
            p_exercise_id: event.exerciseId,
            p_replacement_exercise_id: event.replacementExerciseId,
          };
  const { error } = await supabase.rpc("append_ai_workout_proposal_event", eventArguments);
  if (error) return failureResponse(requestId, operation, "persistence_failed", "database", "EVENT_WRITE_FAILED");
  return new Response(null, { status: 204, headers: { "X-Request-ID": requestId } });
};
