import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Dumbbell, LoaderCircle, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import {
  MAX_REPS,
  MAX_SETS,
  MAX_WORKOUT_EXERCISES,
  MIN_REPS,
  MIN_SETS,
  MANUAL_WORKOUT_REQUEST_VERSION,
  addDraftItem,
  filterCatalogue,
  isCanonicalUuid,
  moveDraftItem,
  removeDraftItem,
  validateDraftItems,
  type CatalogueExercise,
  type EquipmentType,
  type ManualWorkoutDraftItem,
} from "@/lib/manual-workout-builder";
import type { CurrentPlannedWorkout, ManualWorkoutErrorCode } from "@/lib/manual-workouts";

interface Props {
  catalogue: CatalogueExercise[];
  initialCurrentPlan: CurrentPlannedWorkout | null;
}

interface UiError {
  message: string;
  requestId?: string;
}

interface ApiFailureEnvelope {
  code: ManualWorkoutErrorCode;
  requestId: string;
}

const API_ERROR_MESSAGES: Record<ManualWorkoutErrorCode, string> = {
  validation_failed: "The workout could not be validated. Review every sets and reps value, then try again.",
  confirmation_required: "A planned workout now exists. Review it below and confirm that you want to replace it.",
  stale_plan: "The planned workout changed before replacement. Review the refreshed plan and confirm again.",
  unauthenticated: "Your session is no longer available. Sign in again before saving this draft.",
  origin_rejected: "The save request was rejected by the security check. Reload this page before trying again.",
  persistence_failed: "The workout could not be saved. Your draft and existing plan are unchanged; try again.",
};

const API_ERROR_CODES = new Set<ManualWorkoutErrorCode>([
  "validation_failed",
  "confirmation_required",
  "stale_plan",
  "unauthenticated",
  "origin_rejected",
  "persistence_failed",
]);

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Creation time unavailable";
  }

  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCurrentPlan(value: unknown): value is CurrentPlannedWorkout {
  if (!isRecord(value) || !isCanonicalUuid(value.id) || typeof value.createdAt !== "string") {
    return false;
  }

  if ((value.origin !== "manual" && value.origin !== "ai") || !Array.isArray(value.exercises)) {
    return false;
  }

  return value.exercises.every(
    (exercise) =>
      isRecord(exercise) &&
      isCanonicalUuid(exercise.exerciseId) &&
      typeof exercise.name === "string" &&
      Number.isSafeInteger(exercise.position) &&
      Number.isSafeInteger(exercise.sets) &&
      Number.isSafeInteger(exercise.reps),
  );
}

async function readApiFailure(response: Response): Promise<ApiFailureEnvelope | null> {
  try {
    const value: unknown = await response.json();
    if (!isRecord(value) || typeof value.requestId !== "string" || typeof value.code !== "string") {
      return null;
    }

    if (!API_ERROR_CODES.has(value.code as ManualWorkoutErrorCode)) {
      return null;
    }

    return { code: value.code as ManualWorkoutErrorCode, requestId: value.requestId };
  } catch {
    return null;
  }
}

function isPrescriptionValid(item: ManualWorkoutDraftItem): boolean {
  return (
    Number.isSafeInteger(item.sets) &&
    item.sets >= MIN_SETS &&
    item.sets <= MAX_SETS &&
    Number.isSafeInteger(item.reps) &&
    item.reps >= MIN_REPS &&
    item.reps <= MAX_REPS
  );
}

export default function ManualWorkoutBuilder({ catalogue, initialCurrentPlan }: Props) {
  const [search, setSearch] = useState("");
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType[]>([]);
  const [draft, setDraft] = useState<ManualWorkoutDraftItem[]>([]);
  const [currentPlan, setCurrentPlan] = useState(initialCurrentPlan);
  const [confirmingReplacement, setConfirmingReplacement] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const draftHeadingRef = useRef<HTMLHeadingElement>(null);

  const knownExerciseIds = useMemo(() => new Set(catalogue.map(({ id }) => id)), [catalogue]);
  const exercisesById = useMemo(() => new Map(catalogue.map((exercise) => [exercise.id, exercise])), [catalogue]);
  const selectedExerciseIds = useMemo(() => new Set(draft.map(({ exerciseId }) => exerciseId)), [draft]);
  const muscleOptions = useMemo(() => {
    const muscles = new Map<string, string>();
    catalogue.forEach((exercise) => {
      exercise.muscles.forEach(({ code, name }) => {
        muscles.set(code, name);
      });
    });
    return [...muscles].sort(([, left], [, right]) => left.localeCompare(right));
  }, [catalogue]);
  const equipmentOptions = useMemo(() => [...new Set(catalogue.map(({ equipment }) => equipment))].sort(), [catalogue]);
  const filteredCatalogue = useMemo(
    () =>
      filterCatalogue(catalogue, {
        search,
        muscleGroups: selectedMuscles,
        equipment: selectedEquipment,
      }),
    [catalogue, search, selectedEquipment, selectedMuscles],
  );
  const draftValid = validateDraftItems(draft, knownExerciseIds);
  const filtersActive = search.trim() !== "" || selectedMuscles.length > 0 || selectedEquipment.length > 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (confirmingReplacement && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => keepEditingRef.current?.focus());
    } else if (!confirmingReplacement && dialog.open) {
      dialog.close();
      window.requestAnimationFrame(() => saveButtonRef.current?.focus());
    }
  }, [confirmingReplacement]);

  function toggleMuscle(code: string) {
    setSelectedMuscles((selected) =>
      selected.includes(code) ? selected.filter((value) => value !== code) : [...selected, code],
    );
  }

  function toggleEquipment(equipment: EquipmentType) {
    setSelectedEquipment((selected) =>
      selected.includes(equipment) ? selected.filter((value) => value !== equipment) : [...selected, equipment],
    );
  }

  function updatePrescription(exerciseId: string, field: "sets" | "reps", value: number) {
    setDraft((items) => items.map((item) => (item.exerciseId === exerciseId ? { ...item, [field]: value } : item)));
    if (error) setError(null);
  }

  function focusDraftError() {
    window.requestAnimationFrame(() => draftHeadingRef.current?.focus());
  }

  async function refreshCurrentPlan(): Promise<CurrentPlannedWorkout | null> {
    const response = await fetch("/api/workouts/manual", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
    });

    if (!response.ok) {
      const failure = await readApiFailure(response);
      throw new Error(failure?.requestId ?? "REFRESH_FAILED");
    }

    const value: unknown = await response.json();
    if (!isRecord(value) || !("currentPlan" in value)) {
      throw new Error("REFRESH_INVALID");
    }

    if (value.currentPlan !== null && !isCurrentPlan(value.currentPlan)) {
      throw new Error("REFRESH_INVALID");
    }

    setCurrentPlan(value.currentPlan);
    return value.currentPlan;
  }

  async function submitWorkout(replaceExisting: boolean, expectedWorkoutId: string | null) {
    if (!validateDraftItems(draft, knownExerciseIds)) {
      setError({ message: "Fix the highlighted prescriptions before saving. Your draft has not changed." });
      focusDraftError();
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/workouts/manual", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: MANUAL_WORKOUT_REQUEST_VERSION,
          replaceExisting,
          expectedWorkoutId,
          exercises: draft,
        }),
      });

      if (response.ok && response.redirected) {
        window.location.assign(response.url);
        return;
      }

      const failure = await readApiFailure(response);
      if (!failure) {
        setConfirmingReplacement(false);
        setError({
          message: "The server returned an unexpected response. Your draft and existing plan are unchanged.",
        });
        focusDraftError();
        return;
      }

      if (failure.code === "confirmation_required" || failure.code === "stale_plan") {
        try {
          const refreshedPlan = await refreshCurrentPlan();
          setError({ message: API_ERROR_MESSAGES[failure.code], requestId: failure.requestId });
          setConfirmingReplacement(failure.code === "confirmation_required" && refreshedPlan !== null);
        } catch {
          setConfirmingReplacement(false);
          setError({
            message:
              "The current plan changed, but its latest summary could not be loaded. Reload before saving again.",
            requestId: failure.requestId,
          });
        }
      } else {
        setConfirmingReplacement(false);
        setError({ message: API_ERROR_MESSAGES[failure.code], requestId: failure.requestId });
      }

      focusDraftError();
    } catch {
      setConfirmingReplacement(false);
      setError({
        message: "The network request did not complete. Your draft and existing plan are unchanged; try again.",
      });
      focusDraftError();
    } finally {
      setPending(false);
    }
  }

  function handleCreateAndSave() {
    if (!draftValid) {
      setError({ message: "Add at least one valid exercise before saving." });
      focusDraftError();
      return;
    }

    if (currentPlan) {
      setError(null);
      setConfirmingReplacement(true);
      return;
    }

    void submitWorkout(false, null);
  }

  function cancelDraft() {
    setDraft([]);
    window.location.assign("/dashboard");
  }

  return (
    <div className="space-y-6">
      {currentPlan && (
        <section className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-wide text-amber-200 uppercase">Existing plan stays active</p>
              <h2 className="mt-1 text-xl font-bold text-white">
                {currentPlan.origin === "manual" ? "Current manual workout" : "Current AI-generated workout"}
              </h2>
              <p className="mt-2 text-sm text-amber-50/70">Created {formatCreatedAt(currentPlan.createdAt)}</p>
            </div>
            <span className="w-fit rounded-full border border-amber-100/20 px-3 py-1 text-xs font-medium text-amber-100">
              {currentPlan.exercises.length} {currentPlan.exercises.length === 1 ? "exercise" : "exercises"}
            </span>
          </div>
          <ol className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Current planned workout">
            {currentPlan.exercises.map((exercise, index) => (
              <li key={exercise.exerciseId} className="min-w-0 rounded-lg bg-black/15 px-3 py-2 text-sm">
                <span className="font-semibold text-white">
                  {index + 1}. {exercise.name}
                </span>
                <span className="ml-2 text-amber-50/65">
                  {exercise.sets} × {exercise.reps}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-sm leading-6 text-amber-50/75">
            You can build freely below. Nothing changes until you explicitly confirm a full replacement.
          </p>
        </section>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          <p>{error.message}</p>
          {error.requestId && (
            <p className="mt-1 text-xs text-red-100/70">
              Support request ID: <span className="font-mono">{error.requestId}</span>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">
        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium tracking-wide text-purple-300 uppercase">Exercise catalogue</p>
              <h2 className="mt-1 text-2xl font-bold text-white">Find exercises</h2>
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSelectedMuscles([]);
                  setSelectedEquipment([]);
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Reset filters
              </button>
            )}
          </div>

          <label htmlFor="exercise-search" className="mt-5 block text-sm font-medium text-blue-50">
            Search by name
          </label>
          <div className="relative mt-2">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/35"
            />
            <input
              id="exercise-search"
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
              className="min-h-11 w-full rounded-lg border border-white/15 bg-black/20 py-2 pr-3 pl-10 text-white placeholder:text-white/35 focus:border-purple-300 focus:ring-2 focus:ring-purple-400/30 focus:outline-none"
              placeholder="e.g. squat"
            />
          </div>

          <details className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-300">
              Muscle and equipment filters
              <span className="ml-2 text-xs font-normal text-blue-100/55">
                ({selectedMuscles.length + selectedEquipment.length} selected)
              </span>
            </summary>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <fieldset>
                <legend className="text-sm font-semibold text-blue-50">Muscle groups</legend>
                <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1">
                  {muscleOptions.map(([code, name]) => (
                    <label
                      key={code}
                      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-sm text-blue-100/75 hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMuscles.includes(code)}
                        onChange={() => {
                          toggleMuscle(code);
                        }}
                        className="size-4 rounded border-white/20 accent-purple-500"
                      />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="text-sm font-semibold text-blue-50">Equipment</legend>
                <div className="mt-2 space-y-1">
                  {equipmentOptions.map((equipment) => (
                    <label
                      key={equipment}
                      className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-1 text-sm text-blue-100/75 hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEquipment.includes(equipment)}
                        onChange={() => {
                          toggleEquipment(equipment);
                        }}
                        className="size-4 rounded border-white/20 accent-purple-500"
                      />
                      <span>{formatLabel(equipment)}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </details>

          <p className="mt-4 text-sm text-blue-100/60" role="status" aria-live="polite">
            {filteredCatalogue.length} of {catalogue.length} exercises shown
          </p>

          {filteredCatalogue.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
              <Dumbbell aria-hidden="true" className="mx-auto size-8 text-white/30" />
              <p className="mt-3 font-semibold text-white">No exercises match these filters</p>
              <p className="mt-1 text-sm text-blue-100/55">Clear a filter or try a different exercise name.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-3" aria-label="Filtered exercise catalogue">
              {filteredCatalogue.map((exercise) => {
                const selected = selectedExerciseIds.has(exercise.id);
                const primaryMuscles = exercise.muscles.filter(({ role }) => role === "primary");
                const secondaryMuscles = exercise.muscles.filter(({ role }) => role === "secondary");
                return (
                  <li key={exercise.id} className="rounded-xl border border-white/10 bg-black/15 p-4">
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold break-words text-white">{exercise.name}</h3>
                        <p className="mt-1 text-xs font-medium tracking-wide text-purple-200 uppercase">
                          {formatLabel(exercise.equipment)}
                        </p>
                        <p className="mt-2 text-sm leading-5 text-blue-100/65">
                          <span className="font-medium text-blue-50">Primary:</span>{" "}
                          {primaryMuscles.map(({ name }) => name).join(", ") || "None"}
                        </p>
                        {secondaryMuscles.length > 0 && (
                          <p className="mt-1 text-sm leading-5 text-blue-100/55">
                            <span className="font-medium text-blue-50">Secondary:</span>{" "}
                            {secondaryMuscles.map(({ name }) => name).join(", ")}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={selected || draft.length >= MAX_WORKOUT_EXERCISES || pending}
                        onClick={() => {
                          setDraft((items) => addDraftItem(items, exercise.id));
                          setError(null);
                        }}
                        className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-purple-300/30 px-3 py-2 text-sm font-semibold text-purple-100 transition-colors hover:bg-purple-500/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                      >
                        {selected ? (
                          <Check aria-hidden="true" className="size-4" />
                        ) : (
                          <Plus aria-hidden="true" className="size-4" />
                        )}
                        {selected ? "Added" : "Add"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6 lg:sticky lg:top-6">
          <p className="text-sm font-medium tracking-wide text-purple-300 uppercase">Workout draft</p>
          <h2 ref={draftHeadingRef} tabIndex={-1} className="mt-1 text-2xl font-bold text-white focus:outline-none">
            Your exercise order
          </h2>
          <p className="mt-2 text-sm text-blue-100/60">
            {draft.length} of {MAX_WORKOUT_EXERCISES} exercises selected
          </p>

          {draft.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
              <Plus aria-hidden="true" className="mx-auto size-8 text-white/30" />
              <p className="mt-3 font-semibold text-white">Your draft is empty</p>
              <p className="mt-1 text-sm text-blue-100/55">Add an exercise from the catalogue to start at 3 × 10.</p>
            </div>
          ) : (
            <ol className="mt-5 space-y-3" aria-label="Workout draft exercises">
              {draft.map((item, index) => {
                const exercise = exercisesById.get(item.exerciseId);
                const valid = isPrescriptionValid(item);
                return (
                  <li key={item.exerciseId} className="rounded-xl border border-white/10 bg-black/15 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-purple-500/15 text-sm font-semibold text-purple-100"
                        aria-label={`Position ${index + 1}`}
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold break-words text-white">{exercise?.name ?? "Unknown exercise"}</h3>
                        <p className="mt-1 text-xs text-blue-100/50">
                          {exercise ? formatLabel(exercise.equipment) : "Unavailable"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="text-sm font-medium text-blue-50">
                        Sets
                        <input
                          type="number"
                          inputMode="numeric"
                          min={MIN_SETS}
                          max={MAX_SETS}
                          step="1"
                          value={Number.isNaN(item.sets) ? "" : item.sets}
                          disabled={pending}
                          aria-invalid={!valid || undefined}
                          onChange={(event) => {
                            updatePrescription(item.exerciseId, "sets", event.target.valueAsNumber);
                          }}
                          className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-white focus:border-purple-300 focus:ring-2 focus:ring-purple-400/30 focus:outline-none aria-invalid:border-red-300"
                        />
                      </label>
                      <label className="text-sm font-medium text-blue-50">
                        Reps
                        <input
                          type="number"
                          inputMode="numeric"
                          min={MIN_REPS}
                          max={MAX_REPS}
                          step="1"
                          value={Number.isNaN(item.reps) ? "" : item.reps}
                          disabled={pending}
                          aria-invalid={!valid || undefined}
                          onChange={(event) => {
                            updatePrescription(item.exerciseId, "reps", event.target.valueAsNumber);
                          }}
                          className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-white focus:border-purple-300 focus:ring-2 focus:ring-purple-400/30 focus:outline-none aria-invalid:border-red-300"
                        />
                      </label>
                    </div>
                    {!valid && <p className="mt-2 text-xs text-red-200">Use whole values: sets 1–99 and reps 1–999.</p>}

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={index === 0 || pending}
                        onClick={() => {
                          setDraft((items) => moveDraftItem(items, index, "up"));
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-white/15 px-2 py-2 text-xs font-medium text-blue-50 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={`Move ${exercise?.name ?? "exercise"} up`}
                      >
                        <ArrowUp aria-hidden="true" className="size-4" /> Up
                      </button>
                      <button
                        type="button"
                        disabled={index === draft.length - 1 || pending}
                        onClick={() => {
                          setDraft((items) => moveDraftItem(items, index, "down"));
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-white/15 px-2 py-2 text-xs font-medium text-blue-50 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={`Move ${exercise?.name ?? "exercise"} down`}
                      >
                        <ArrowDown aria-hidden="true" className="size-4" /> Down
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setDraft((items) => removeDraftItem(items, item.exerciseId));
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-red-300/25 px-2 py-2 text-xs font-medium text-red-200 hover:bg-red-400/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-35"
                        aria-label={`Remove ${exercise?.name ?? "exercise"}`}
                      >
                        <Trash2 aria-hidden="true" className="size-4" /> Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row-reverse">
            <button
              ref={saveButtonRef}
              type="button"
              disabled={!draftValid || pending}
              onClick={handleCreateAndSave}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="size-4" />
              )}
              <span>{pending ? "Saving…" : "Create and Save"}</span>
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={cancelDraft}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <X aria-hidden="true" className="size-4" />
              Cancel
            </button>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {pending ? "Saving the manual workout. Controls are temporarily unavailable." : ""}
          </p>
        </section>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="replacement-title"
        aria-describedby="replacement-description"
        onCancel={(event) => {
          if (pending) {
            event.preventDefault();
          } else {
            setConfirmingReplacement(false);
          }
        }}
        onClose={() => {
          if (confirmingReplacement) setConfirmingReplacement(false);
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-white/15 bg-slate-950 p-0 text-white shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm"
      >
        <div className="p-5 sm:p-7">
          <p className="text-sm font-medium tracking-wide text-amber-300 uppercase">Replacement confirmation</p>
          <h2 id="replacement-title" className="mt-2 text-2xl font-bold tracking-tight">
            Replace the current planned workout?
          </h2>
          <p id="replacement-description" className="mt-3 text-sm leading-6 text-blue-100/70">
            This saves the complete draft as your new plan and removes the current planned workout only if it is still
            the exact plan shown above. Completed workouts are unaffected.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row-reverse">
            <button
              type="button"
              disabled={pending || !currentPlan}
              onClick={() => {
                if (currentPlan) void submitWorkout(true, currentPlan.id);
              }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Check aria-hidden="true" className="size-4" />
              )}
              {pending ? "Replacing…" : "Replace planned workout"}
            </button>
            <button
              ref={keepEditingRef}
              type="button"
              disabled={pending}
              onClick={() => {
                setConfirmingReplacement(false);
              }}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Keep editing
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
