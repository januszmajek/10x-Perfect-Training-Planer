import { buildAiWorkoutResponseSchema } from "./ai-workout-contract.ts";
import type { AiWorkoutPrompt } from "./ai-workout-prompt.ts";

export const OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_CURRENT_KEY_URL = "https://openrouter.ai/api/v1/key";
export const MAX_OPENROUTER_RESPONSE_BYTES = 128 * 1024;
const OPENROUTER_KEY_VALIDATION_TIMEOUT_MS = 5_000;

export type OpenRouterFailureCode =
  | "invalid_credential"
  | "rate_limited"
  | "timeout"
  | "provider_unavailable"
  | "network_failure"
  | "response_too_large"
  | "malformed_response"
  | "invalid_completion";

export type OpenRouterResult = { ok: true; data: { content: string } } | { ok: false; code: OpenRouterFailureCode };
export type OpenRouterKeyValidationResult = { ok: true } | { ok: false; code: "rejected" | "retry" };

export interface OpenRouterRequest {
  apiKey: string;
  model: string;
  prompt: AiWorkoutPrompt;
  allowedExerciseIds: readonly string[];
  requestedExerciseCount: { min: number; max: number };
}

export type OpenRouterFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function validateOpenRouterKey(
  apiKey: string,
  fetchImpl: OpenRouterFetch = fetch,
): Promise<OpenRouterKeyValidationResult> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, OPENROUTER_KEY_VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetchImpl(OPENROUTER_CURRENT_KEY_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: abortController.signal,
    });

    if (response.ok) return { ok: true };
    if (response.status === 401 || response.status === 403) return { ok: false, code: "rejected" };
    return { ok: false, code: "retry" };
  } catch {
    return { ok: false, code: "retry" };
  } finally {
    clearTimeout(timeout);
  }
}

function mapStatus(status: number): OpenRouterFailureCode {
  if (status === 401 || status === 403) return "invalid_credential";
  if (status === 429) return "rate_limited";
  return "provider_unavailable";
}

function isCompletion(value: unknown): value is { choices: [{ message: { content: string } }] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const choices = (value as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length !== 1) return false;
  const message = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>).message : null;
  return (
    typeof message === "object" && message !== null && typeof (message as Record<string, unknown>).content === "string"
  );
}

async function readBoundedResponse(response: Response): Promise<{ ok: true; data: string } | { ok: false }> {
  const declaredLength = response.headers.get("Content-Length");
  if (
    declaredLength !== null &&
    (!/^\d+$/.test(declaredLength) || Number(declaredLength) > MAX_OPENROUTER_RESPONSE_BYTES)
  ) {
    return { ok: false };
  }

  const content = await response.text();
  return new TextEncoder().encode(content).byteLength <= MAX_OPENROUTER_RESPONSE_BYTES
    ? { ok: true, data: content }
    : { ok: false };
}

export async function requestOpenRouterWorkout(
  request: OpenRouterRequest,
  fetchImpl: OpenRouterFetch = fetch,
): Promise<OpenRouterResult> {
  try {
    const responseSchema = buildAiWorkoutResponseSchema(request.allowedExerciseIds, request.requestedExerciseCount);
    const response = await fetchImpl(OPENROUTER_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${request.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: request.model,
        stream: false,
        messages: [
          { role: "system", content: request.prompt.system },
          { role: "user", content: request.prompt.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "ai_workout_proposal", strict: true, schema: responseSchema },
        },
        provider: { require_parameters: true },
      }),
    });

    if (!response.ok) return { ok: false, code: mapStatus(response.status) };
    const body = await readBoundedResponse(response);
    if (!body.ok) return { ok: false, code: "response_too_large" };

    let parsed: unknown;
    try {
      parsed = JSON.parse(body.data);
    } catch {
      return { ok: false, code: "malformed_response" };
    }
    if (!isCompletion(parsed)) return { ok: false, code: "invalid_completion" };
    return { ok: true, data: { content: parsed.choices[0].message.content } };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, code: "timeout" };
    }
    return { ok: false, code: "network_failure" };
  }
}
