import type { APIRoute } from "astro";
import { parseWorkoutHistorySearchParams } from "@/lib/workout-history-client";
import { failureResponse, requireAuthenticatedLocals, successJson } from "@/lib/workout-api";
import { loadCompletedWorkoutHistory, loadHistoryMuscleOptions } from "@/lib/workout-history";

export const GET: APIRoute = async (context) => {
  const requestId = crypto.randomUUID();
  const operation = "get_completed_history" as const;
  const authFailure = requireAuthenticatedLocals(context, requestId, operation);
  if (authFailure) return authFailure;

  const { supabase, user } = context.locals;
  if (!supabase || !user) {
    return failureResponse(requestId, operation, "unauthenticated", "request", "AUTH_LOCALS_MISSING");
  }

  const optionsResult = await loadHistoryMuscleOptions(supabase, user.id);
  if (!optionsResult.ok) {
    return failureResponse(
      requestId,
      operation,
      optionsResult.code,
      optionsResult.internal.layer,
      optionsResult.internal.technicalCode,
    );
  }

  const parsed = parseWorkoutHistorySearchParams(
    context.url.searchParams,
    new Set(optionsResult.data.map((option) => option.code)),
  );
  if (!parsed.valid) {
    return failureResponse(requestId, operation, "validation_failed", "validation", "INVALID_HISTORY_QUERY");
  }

  const historyResult = await loadCompletedWorkoutHistory(supabase, user.id, parsed.filters, parsed.cursor);
  if (!historyResult.ok) {
    return failureResponse(
      requestId,
      operation,
      historyResult.code,
      historyResult.internal.layer,
      historyResult.internal.technicalCode,
    );
  }

  return successJson(requestId, historyResult.data);
};
