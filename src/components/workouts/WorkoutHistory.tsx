import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  historyPresetRange,
  isCurrentHistoryRequest,
  localDateRangeToHistoryFilters,
  mergeWorkoutHistoryPage,
  parseWorkoutHistoryResponse,
  parseWorkoutHistorySearchParams,
  toWorkoutHistoryApiUrl,
  toWorkoutHistoryPageUrl,
  type CompletedWorkoutHistoryEntry,
  type MuscleOption,
  type WorkoutHistoryFilters,
  type WorkoutHistoryPage,
} from "@/lib/workout-history-client";

interface Props {
  initialFilters: WorkoutHistoryFilters;
  initialPage: WorkoutHistoryPage;
  muscleOptions: MuscleOption[];
}

interface LocalDateRange {
  start: string;
  end: string;
}

interface HistoryFailure {
  message: string;
  requestId: string | null;
  retryable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function localDateValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localRangeFromFilters(filters: WorkoutHistoryFilters): LocalDateRange | null {
  if (!filters.completedFrom || !filters.completedBefore) return null;
  const start = new Date(filters.completedFrom);
  const exclusiveEnd = new Date(filters.completedBefore);
  if (Number.isNaN(start.getTime()) || Number.isNaN(exclusiveEnd.getTime())) return null;
  exclusiveEnd.setDate(exclusiveEnd.getDate() - 1);
  return { start: localDateValue(start), end: localDateValue(exclusiveEnd) };
}

function filtersFromControls(range: LocalDateRange | null, muscles: readonly string[]): WorkoutHistoryFilters | null {
  if (!range || (!range.start && !range.end)) return { muscles: [...new Set(muscles)].sort() };
  if (!range.start || !range.end) return null;
  return localDateRangeToHistoryFilters(range, muscles);
}

function hasFilters(range: LocalDateRange | null, muscles: readonly string[]): boolean {
  return muscles.length > 0 || range !== null;
}

function involvedMuscles(entry: CompletedWorkoutHistoryEntry): MuscleOption[] {
  const muscles = new Map<string, string>();
  entry.exercises.forEach((exercise) => {
    exercise.muscles.forEach((muscle) => muscles.set(muscle.code, muscle.name));
  });
  return [...muscles.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function formatCompletion(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Completion time unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

async function readFailure(response: Response): Promise<HistoryFailure> {
  const fallback: HistoryFailure = {
    message: "The history request could not be completed. Please try again.",
    requestId: response.headers.get("X-Request-ID"),
    retryable: response.status >= 500,
  };
  try {
    const value: unknown = await response.json();
    if (!isRecord(value) || typeof value.requestId !== "string") return fallback;
    return { ...fallback, requestId: value.requestId };
  } catch {
    return fallback;
  }
}

function ErrorMessage({
  failure,
  retryLabel,
  onRetry,
}: {
  failure: HistoryFailure;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      <p>{failure.message}</p>
      {failure.requestId && <p className="mt-1 text-xs text-red-100/70">Support request ID: {failure.requestId}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border border-red-100/30 px-3 py-2 text-sm font-semibold text-red-50 transition-colors hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-100"
      >
        {retryLabel}
      </button>
    </div>
  );
}

export default function WorkoutHistory({ initialFilters, initialPage, muscleOptions }: Props) {
  const [dateRange, setDateRange] = useState<LocalDateRange | null>(() => localRangeFromFilters(initialFilters));
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>(initialFilters.muscles);
  const [page, setPage] = useState<WorkoutHistoryPage>(initialPage);
  const [committedFilters, setCommittedFilters] = useState<WorkoutHistoryFilters>(initialFilters);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [isReplacing, setIsReplacing] = useState(false);
  const [isAppending, setIsAppending] = useState(false);
  const [refreshFailure, setRefreshFailure] = useState<HistoryFailure | null>(null);
  const [appendFailure, setAppendFailure] = useState<HistoryFailure | null>(null);
  const pageRef = useRef(initialPage);
  const requestRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const appendRetryTimerRef = useRef<number | null>(null);
  const appendInFlightRef = useRef(false);
  const appendFailureLockedRef = useRef(false);
  const appendExitObservedRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  const clearFiltersRef = useRef<HTMLButtonElement>(null);
  const knownMuscles = useMemo(() => new Set(muscleOptions.map((option) => option.code)), [muscleOptions]);

  const cancelActiveWork = useCallback(() => {
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
    if (appendRetryTimerRef.current !== null) window.clearTimeout(appendRetryTimerRef.current);
    appendRetryTimerRef.current = null;
    appendInFlightRef.current = false;
  }, []);

  const resetAppendRecovery = useCallback(() => {
    appendFailureLockedRef.current = false;
    appendExitObservedRef.current = false;
  }, []);

  const startReplacement = useCallback(
    async (filters: WorkoutHistoryFilters, shouldWriteUrl: boolean) => {
      cancelActiveWork();
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      const controller = new AbortController();
      requestRef.current = controller;
      setIsReplacing(true);
      setIsAppending(false);
      resetAppendRecovery();
      setRefreshFailure(null);
      setAppendFailure(null);
      setExpandedIds(new Set());
      setCommittedFilters(filters);
      if (shouldWriteUrl) window.history.replaceState(null, "", toWorkoutHistoryPageUrl(filters));

      try {
        const response = await fetch(toWorkoutHistoryApiUrl(filters), {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          const failure = await readFailure(response);
          if (mountedRef.current && isCurrentHistoryRequest(generation, generationRef.current))
            setRefreshFailure(failure);
          return;
        }
        const value: unknown = await response.json();
        const nextPage = parseWorkoutHistoryResponse(value);
        if (!nextPage) {
          if (mountedRef.current && isCurrentHistoryRequest(generation, generationRef.current)) {
            setRefreshFailure({
              message: "The history response was incomplete. Your current results are still available; try again.",
              requestId: response.headers.get("X-Request-ID"),
              retryable: false,
            });
          }
          return;
        }
        if (mountedRef.current && isCurrentHistoryRequest(generation, generationRef.current)) {
          pageRef.current = nextPage;
          setPage(nextPage);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (mountedRef.current && isCurrentHistoryRequest(generation, generationRef.current)) {
          setRefreshFailure({
            message:
              "The history request could not reach the server. Your current results are still available; try again.",
            requestId: null,
            retryable: true,
          });
        }
      } finally {
        if (mountedRef.current && isCurrentHistoryRequest(generation, generationRef.current)) {
          setIsReplacing(false);
          if (requestRef.current === controller) requestRef.current = null;
        }
      }
    },
    [cancelActiveWork, resetAppendRecovery],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDateRange(localRangeFromFilters(initialFilters));
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [initialFilters]);

  useEffect(() => {
    mountedRef.current = true;
    const handlePopState = () => {
      const parsed = parseWorkoutHistorySearchParams(new URLSearchParams(window.location.search), knownMuscles, false);
      if (!parsed.valid || parsed.cursor) return;
      setDateRange(localRangeFromFilters(parsed.filters));
      setSelectedMuscles(parsed.filters.muscles);
      void startReplacement(parsed.filters, false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      mountedRef.current = false;
      cancelActiveWork();
      window.removeEventListener("popstate", handlePopState);
    };
  }, [cancelActiveWork, knownMuscles, startReplacement]);

  function scheduleReplacement(nextRange: LocalDateRange | null, nextMuscles: string[], immediate = false) {
    setDateRange(nextRange);
    setSelectedMuscles(nextMuscles);
    const filters = filtersFromControls(nextRange, nextMuscles);
    cancelActiveWork();
    setIsReplacing(false);
    resetAppendRecovery();
    setAppendFailure(null);
    if (!filters) {
      setRefreshFailure({
        message: "Choose a valid start and end date before filtering history.",
        requestId: null,
        retryable: false,
      });
      return;
    }
    setRefreshFailure(null);
    const request = () => void startReplacement(filters, true);
    if (immediate) request();
    else debounceTimerRef.current = window.setTimeout(request, 250);
  }

  const loadMore = useCallback(async () => {
    const cursor = pageRef.current.nextCursor;
    if (!cursor || isReplacing || appendInFlightRef.current) return;
    cancelActiveWork();
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    appendInFlightRef.current = true;
    setIsAppending(true);
    setAppendFailure(null);

    try {
      let failure: HistoryFailure | null = null;
      for (let attempt = 0; attempt <= 2; attempt += 1) {
        const controller = new AbortController();
        requestRef.current = controller;
        try {
          const response = await fetch(toWorkoutHistoryApiUrl(committedFilters, cursor), {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
          if (!response.ok) {
            failure = await readFailure(response);
          } else {
            const value: unknown = await response.json();
            const nextPage = parseWorkoutHistoryResponse(value);
            if (!nextPage) {
              failure = {
                message: "The next history page was incomplete. Your loaded workouts are still available.",
                requestId: response.headers.get("X-Request-ID"),
                retryable: false,
              };
            } else if (mountedRef.current && isCurrentHistoryRequest(generation, generationRef.current)) {
              setPage((current) => {
                const merged = mergeWorkoutHistoryPage(current, nextPage, "append");
                pageRef.current = merged;
                return merged;
              });
              return;
            } else {
              return;
            }
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          failure = {
            message: "The next history page could not be loaded. Your loaded workouts are still available.",
            requestId: null,
            retryable: true,
          };
        } finally {
          if (requestRef.current === controller) requestRef.current = null;
        }
        if (!failure.retryable || attempt === 2) break;
        await new Promise<void>((resolve) => {
          appendRetryTimerRef.current = window.setTimeout(resolve, 500 * (attempt + 1));
        });
        appendRetryTimerRef.current = null;
        if (!mountedRef.current || !isCurrentHistoryRequest(generation, generationRef.current)) return;
      }
      if (mountedRef.current && isCurrentHistoryRequest(generation, generationRef.current)) {
        appendFailureLockedRef.current = true;
        appendExitObservedRef.current = false;
        setAppendFailure(failure);
      }
    } finally {
      if (mountedRef.current && isCurrentHistoryRequest(generation, generationRef.current)) {
        setIsAppending(false);
      }
      appendInFlightRef.current = false;
    }
  }, [cancelActiveWork, committedFilters, isReplacing]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !page.nextCursor || isReplacing || isAppending) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          appendExitObservedRef.current = true;
          return;
        }
        if (appendFailureLockedRef.current) {
          if (!appendExitObservedRef.current) return;
          resetAppendRecovery();
          setAppendFailure(null);
        }
        void loadMore();
      },
      { rootMargin: "0px 0px 400px" },
    );
    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [isAppending, isReplacing, loadMore, page.nextCursor, resetAppendRecovery]);

  const filtersActive = hasFilters(dateRange, selectedMuscles);
  const initialView = !filtersActive && page.entries.length === 0;
  const visibleMuscles = dateRange
    ? [dateRange.start === "" ? "Start date" : dateRange.start, dateRange.end === "" ? "End date" : dateRange.end]
    : [];

  return (
    <section aria-label="Completed workout history" aria-busy={isReplacing || isAppending}>
      <div className="rounded-xl border border-white/10 bg-black/15 p-4 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Refine your history</h2>
            <p className="mt-1 text-sm leading-6 text-blue-100/65">
              Date and muscle filters update results automatically.
            </p>
          </div>
          <button
            ref={clearFiltersRef}
            type="button"
            disabled={!filtersActive}
            onClick={() => {
              scheduleReplacement(null, [], true);
              window.requestAnimationFrame(() => clearFiltersRef.current?.focus());
            }}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Clear filters
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-blue-50">
            Start date
            <input
              type="date"
              value={dateRange?.start ?? ""}
              onChange={(event) => {
                scheduleReplacement({ start: event.target.value, end: dateRange?.end ?? "" }, selectedMuscles);
              }}
              className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
            />
          </label>
          <label className="text-sm font-medium text-blue-50">
            End date
            <input
              type="date"
              value={dateRange?.end ?? ""}
              onChange={(event) => {
                scheduleReplacement({ start: dateRange?.start ?? "", end: event.target.value }, selectedMuscles);
              }}
              className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {(["7d", "30d", "90d"] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                scheduleReplacement(historyPresetRange(preset), selectedMuscles, true);
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-purple-300/30 px-3 py-2 text-sm font-semibold text-purple-100 transition-colors hover:bg-purple-500/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
            >
              Last {preset.replace("d", " days")}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              scheduleReplacement(null, selectedMuscles, true);
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
          >
            All history
          </button>
        </div>

        <details className="mt-4 rounded-xl border border-white/10 bg-slate-950/25 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white">
            Muscle groups ({selectedMuscles.length} selected)
          </summary>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-blue-50">Match any selected muscle</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {muscleOptions.map((muscle) => {
                const selected = selectedMuscles.includes(muscle.code);
                return (
                  <label
                    key={muscle.code}
                    className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-blue-100/80 hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => {
                        const next = selected
                          ? selectedMuscles.filter((code) => code !== muscle.code)
                          : [...selectedMuscles, muscle.code].sort();
                        scheduleReplacement(dateRange, next);
                      }}
                      className="size-4 shrink-0 accent-purple-500"
                    />
                    <span className="min-w-0 break-words">{muscle.name}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </details>

        {filtersActive && (
          <p className="mt-4 text-sm text-blue-100/70">
            Active filters:{" "}
            {[
              ...visibleMuscles,
              ...selectedMuscles.map((code) => muscleOptions.find((option) => option.code === code)?.name ?? code),
            ].join(", ")}
          </p>
        )}
      </div>

      <p aria-atomic="true" aria-live="polite" className="sr-only">
        {!isReplacing && !isAppending
          ? `${page.entries.length} ${page.entries.length === 1 ? "workout" : "workouts"} shown.`
          : ""}
      </p>

      {refreshFailure && (
        <div className="mt-5">
          <ErrorMessage
            failure={refreshFailure}
            retryLabel="Retry history"
            onRetry={() => void startReplacement(committedFilters, false)}
          />
        </div>
      )}

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <p className="text-sm text-blue-100/65" role="status">
          {isReplacing
            ? "Updating history…"
            : `${page.entries.length} ${page.entries.length === 1 ? "workout" : "workouts"} shown`}
        </p>
      </div>

      {page.entries.length === 0 && !isReplacing ? (
        <div className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
          <p className="font-semibold text-white">
            {initialView ? "No completed workouts yet" : "No workouts match these filters"}
          </p>
          <p className="mt-2 text-sm leading-6 text-blue-100/65">
            {initialView
              ? "Mark a planned workout done and it will appear here with its complete prescription."
              : "Try a wider date range or remove one or more muscle filters."}
          </p>
          {initialView ? (
            <a
              href="/dashboard"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
            >
              Go to dashboard
            </a>
          ) : (
            <button
              type="button"
              onClick={() => {
                scheduleReplacement(null, [], true);
                window.requestAnimationFrame(() => clearFiltersRef.current?.focus());
              }}
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <ol className="mt-5 space-y-3" aria-label="Completed workouts">
          {page.entries.map((entry) => {
            const expanded = expandedIds.has(entry.id);
            const detailId = `history-detail-${entry.id}`;
            const muscles = involvedMuscles(entry);
            return (
              <li key={entry.id} className="min-w-0 rounded-xl border border-white/10 bg-black/15 p-4">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold break-words text-white">
                      {entry.origin === "ai" ? "AI workout" : "Manual workout"}
                    </p>
                    <time
                      suppressHydrationWarning
                      className="mt-1 block text-sm text-blue-100/65"
                      dateTime={entry.completedAt}
                    >
                      Completed {formatCompletion(entry.completedAt)}
                    </time>
                    <p className="mt-2 text-sm text-blue-100/70">
                      {entry.exercises.length} {entry.exercises.length === 1 ? "exercise" : "exercises"}
                    </p>
                    {muscles.length > 0 && (
                      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Involved muscle groups">
                        {muscles.map((muscle) => (
                          <li
                            key={muscle.code}
                            className="rounded-full bg-purple-500/15 px-2.5 py-1 text-xs text-purple-100"
                          >
                            {muscle.name}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={detailId}
                    onClick={() => {
                      setExpandedIds((current) => {
                        const next = new Set(current);
                        if (next.has(entry.id)) next.delete(entry.id);
                        else next.add(entry.id);
                        return next;
                      });
                    }}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
                  >
                    {expanded ? "Hide details" : "Show details"}
                  </button>
                </div>

                {expanded && (
                  <div id={detailId} className="mt-4 border-t border-white/10 pt-4">
                    <p className="text-sm text-blue-100/65">
                      Origin: {entry.origin === "ai" ? "AI-generated" : "Manual"} · Created{" "}
                      <time dateTime={entry.createdAt}>{formatCompletion(entry.createdAt)}</time>
                    </p>
                    <ol
                      className="mt-4 space-y-3"
                      aria-label={`${entry.origin === "ai" ? "AI" : "Manual"} workout prescription`}
                    >
                      {entry.exercises.map((exercise) => (
                        <li key={exercise.exerciseId} className="min-w-0 rounded-lg bg-white/5 p-3">
                          <p className="font-semibold break-words text-white">
                            {exercise.position + 1}. {exercise.name}
                          </p>
                          <p className="mt-1 text-sm text-blue-100/70">
                            {exercise.sets} {exercise.sets === 1 ? "set" : "sets"} × {exercise.reps}{" "}
                            {exercise.reps === 1 ? "rep" : "reps"}
                          </p>
                          <ul className="mt-2 flex flex-wrap gap-2" aria-label={`${exercise.name} muscle roles`}>
                            {exercise.muscles.map((muscle) => (
                              <li
                                key={`${muscle.code}-${muscle.role}`}
                                className="rounded-full bg-slate-950/60 px-2 py-1 text-xs text-blue-100/75"
                              >
                                {muscle.name} · {muscle.role}
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {(page.nextCursor !== null || appendFailure !== null) && (
        <div className="mt-5">
          {appendFailure && (
            <div
              role="alert"
              className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            >
              <p>{appendFailure.message}</p>
              {appendFailure.requestId && (
                <p className="mt-1 text-xs text-red-100/70">Support request ID: {appendFailure.requestId}</p>
              )}
              <p className="mt-2 text-xs text-red-100/70">Scroll away and back to the end to try loading again.</p>
            </div>
          )}
          {page.nextCursor && <div ref={sentinelRef} aria-hidden="true" className="mt-3 h-px" />}
          {isAppending && (
            <div className="mt-3 flex items-center gap-2 text-sm text-blue-100/70" role="status">
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-purple-200/30 border-t-purple-200"
              />
              Loading more workouts…
            </div>
          )}
        </div>
      )}
    </section>
  );
}
