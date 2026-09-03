import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Dumbbell,
  Plus,
  Replace,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import {
  MAX_REPS,
  MAX_SETS,
  MAX_WORKOUT_EXERCISES,
  MIN_REPS,
  MIN_SETS,
  addDraftItem,
  filterCatalogue,
  moveDraftItem,
  removeDraftItem,
  replaceDraftItem,
  validateDraftItems,
  type CatalogueExercise,
  type EquipmentType,
  type ManualWorkoutDraftItem,
} from "@/lib/manual-workout-builder";

interface Props {
  catalogue: CatalogueExercise[];
  draft: ManualWorkoutDraftItem[];
  pending: boolean;
  saveLabel: string;
  error?: string | null;
  onChange: (draft: ManualWorkoutDraftItem[]) => void;
  onSave: () => void;
  onCancel: () => void;
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function WorkoutDraftEditor({
  catalogue,
  draft,
  pending,
  saveLabel,
  error,
  onChange,
  onSave,
  onCancel,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType[]>([]);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const knownExerciseIds = useMemo(() => new Set(catalogue.map(({ id }) => id)), [catalogue]);
  const exercisesById = useMemo(() => new Map(catalogue.map((exercise) => [exercise.id, exercise])), [catalogue]);
  const selectedExerciseIds = useMemo(() => new Set(draft.map(({ exerciseId }) => exerciseId)), [draft]);
  const filteredCatalogue = useMemo(
    () => filterCatalogue(catalogue, { search, muscleGroups: selectedMuscles, equipment: selectedEquipment }),
    [catalogue, search, selectedEquipment, selectedMuscles],
  );
  const muscleOptions = useMemo(() => {
    const options = new Map<string, string>();
    catalogue.forEach((exercise) => {
      exercise.muscles.forEach(({ code, name }) => options.set(code, name));
    });
    return [...options].sort(([, left], [, right]) => left.localeCompare(right));
  }, [catalogue]);
  const equipmentOptions = useMemo(() => [...new Set(catalogue.map(({ equipment }) => equipment))].sort(), [catalogue]);
  const primaryMuscleOptions = useMemo(
    () =>
      muscleOptions.filter(([code]) =>
        catalogue.some((exercise) =>
          exercise.muscles.some((muscle) => muscle.code === code && muscle.role === "primary"),
        ),
      ),
    [catalogue, muscleOptions],
  );
  const secondaryMuscleOptions = useMemo(
    () =>
      muscleOptions.filter(([code]) =>
        catalogue.some((exercise) =>
          exercise.muscles.some((muscle) => muscle.code === code && muscle.role === "secondary"),
        ),
      ),
    [catalogue, muscleOptions],
  );
  const draftValid = validateDraftItems(draft, knownExerciseIds);
  const filtersActive = search.trim() !== "" || selectedMuscles.length > 0 || selectedEquipment.length > 0;

  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFiltersOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    const trigger = filterTriggerRef.current;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [filtersOpen]);

  function updateItem(index: number, update: Partial<ManualWorkoutDraftItem>) {
    onChange(draft.map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item)));
  }

  function moveItem(index: number, direction: "up" | "down") {
    onChange(moveDraftItem(draft, index, direction));
  }

  const replacingExercise = replacingIndex === null ? null : draft[replacingIndex];
  const replacingExerciseName = replacingExercise ? exercisesById.get(replacingExercise.exerciseId)?.name : null;

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}
      {filtersOpen && (
        <button
          aria-label="Close filters"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => {
            setFiltersOpen(false);
          }}
        />
      )}
      <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)_minmax(20rem,0.85fr)] xl:items-start">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-r-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl transition-transform duration-300 lg:static lg:w-auto lg:translate-x-0 lg:overflow-visible lg:rounded-2xl lg:bg-white/5 lg:p-6 lg:shadow-none ${filtersOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium tracking-wide text-purple-300 uppercase">Exercise catalogue</p>
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Close filters"
                  onClick={() => {
                    setFiltersOpen(false);
                  }}
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-white/15 text-blue-50 lg:hidden"
                >
                  <ArrowLeft aria-hidden="true" className="size-5" />
                </button>
                <h2 className="text-2xl font-bold text-white">Filters</h2>
              </div>
            </div>
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setSelectedMuscles([]);
                  setSelectedEquipment([]);
                }}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-blue-50 hover:bg-white/10"
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
              className="min-h-11 w-full rounded-lg border border-white/15 bg-black/20 py-2 pr-3 pl-10 text-white"
              placeholder="e.g. squat"
            />
          </div>
          <div className="mt-4 grid gap-4">
            <details className="rounded-xl border border-white/10 bg-black/10 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Main muscles ({primaryMuscleOptions.filter(([code]) => selectedMuscles.includes(code)).length} selected)
              </summary>
              <fieldset>
                <legend className="sr-only">Main muscles</legend>
                {primaryMuscleOptions.map(([code, name]) => (
                  <label key={code} className="mt-2 flex min-h-10 items-center gap-3 text-sm text-blue-100/75">
                    <input
                      type="checkbox"
                      checked={selectedMuscles.includes(code)}
                      onChange={() => {
                        setSelectedMuscles((items) =>
                          items.includes(code) ? items.filter((item) => item !== code) : [...items, code],
                        );
                      }}
                      className="size-4 accent-purple-500"
                    />
                    {name}
                  </label>
                ))}
              </fieldset>
            </details>
            <details className="rounded-xl border border-white/10 bg-black/10 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Secondary muscles ({secondaryMuscleOptions.filter(([code]) => selectedMuscles.includes(code)).length}{" "}
                selected)
              </summary>
              <fieldset>
                <legend className="sr-only">Secondary muscles</legend>
                {secondaryMuscleOptions.map(([code, name]) => (
                  <label key={code} className="mt-2 flex min-h-10 items-center gap-3 text-sm text-blue-100/75">
                    <input
                      type="checkbox"
                      checked={selectedMuscles.includes(code)}
                      onChange={() => {
                        setSelectedMuscles((items) =>
                          items.includes(code) ? items.filter((item) => item !== code) : [...items, code],
                        );
                      }}
                      className="size-4 accent-purple-500"
                    />
                    {name}
                  </label>
                ))}
              </fieldset>
            </details>
            <details className="rounded-xl border border-white/10 bg-black/10 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-white">
                Equipment ({selectedEquipment.length} selected)
              </summary>
              <fieldset>
                <legend className="sr-only">Equipment</legend>
                {equipmentOptions.map((equipment) => (
                  <label key={equipment} className="mt-2 flex min-h-10 items-center gap-3 text-sm text-blue-100/75">
                    <input
                      type="checkbox"
                      checked={selectedEquipment.includes(equipment)}
                      onChange={() => {
                        setSelectedEquipment((items) =>
                          items.includes(equipment)
                            ? items.filter((item) => item !== equipment)
                            : [...items, equipment],
                        );
                      }}
                      className="size-4 accent-purple-500"
                    />
                    {formatLabel(equipment)}
                  </label>
                ))}
              </fieldset>
            </details>
          </div>
        </aside>
        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
          <p className="text-sm font-medium tracking-wide text-purple-300 uppercase">Exercise catalogue</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Find exercises</h2>
          <button
            ref={filterTriggerRef}
            type="button"
            onClick={() => {
              setFiltersOpen(true);
            }}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-blue-50 lg:hidden"
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" /> Filters
          </button>
          <p className="mt-4 text-sm text-blue-100/60" role="status">
            {filteredCatalogue.length} of {catalogue.length} exercises shown
          </p>
          <ul className="mt-4 space-y-3" aria-label="Filtered exercise catalogue">
            {filteredCatalogue.map((exercise) => {
              const selected = selectedExerciseIds.has(exercise.id);
              const isReplacementTarget = replacingIndex !== null;
              const selectedElsewhere = selected && draft[replacingIndex ?? -1]?.exerciseId !== exercise.id;
              const isCurrentReplacement = isReplacementTarget && draft[replacingIndex]?.exerciseId === exercise.id;
              return (
                <li key={exercise.id} className="rounded-xl border border-white/10 bg-black/15 p-4">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="font-semibold break-words text-white">{exercise.name}</h3>
                      <p className="mt-1 text-xs text-purple-200 uppercase">{formatLabel(exercise.equipment)}</p>
                      {exercise.muscles.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-2" aria-label={`${exercise.name} muscle groups`}>
                          {exercise.muscles.map((muscle) => (
                            <li
                              key={`${muscle.code}-${muscle.role}`}
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
                      disabled={
                        pending ||
                        (isReplacementTarget
                          ? selectedElsewhere || isCurrentReplacement
                          : selected || draft.length >= MAX_WORKOUT_EXERCISES)
                      }
                      onClick={() => {
                        if (replacingIndex !== null) {
                          onChange(replaceDraftItem(draft, replacingIndex, exercise.id));
                          setReplacingIndex(null);
                          return;
                        }
                        onChange(addDraftItem(draft, exercise.id));
                      }}
                      className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-purple-300/30 px-3 py-2 text-sm font-semibold text-purple-100 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                    >
                      {isCurrentReplacement ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : (
                        <Plus aria-hidden="true" className="size-4" />
                      )}
                      {isReplacementTarget
                        ? isCurrentReplacement
                          ? "Current"
                          : "Replace"
                        : selected
                          ? "Added"
                          : "Add"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {filteredCatalogue.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
              <Dumbbell aria-hidden="true" className="mx-auto size-8 text-white/30" />
              <p className="mt-3 font-semibold text-white">No exercises match these filters</p>
            </div>
          )}
        </section>
        <section className="min-w-0 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6 xl:sticky xl:top-6">
          <p className="text-sm font-medium tracking-wide text-purple-300 uppercase">Workout draft</p>
          <h2 className="mt-1 text-2xl font-bold text-white">Your exercise order</h2>
          {replacingIndex !== null && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-300/30 bg-amber-400/10 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-amber-100" role="status">
                Replacing {replacingExerciseName ?? "this exercise"}. Choose an available catalogue exercise.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setReplacingIndex(null);
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-amber-100/25 px-3 py-2 text-sm font-medium text-amber-50 disabled:opacity-45"
              >
                <X aria-hidden="true" className="size-4" />
                Cancel replace
              </button>
            </div>
          )}
          <p className="mt-2 text-sm text-blue-100/60">
            {draft.length} of {MAX_WORKOUT_EXERCISES} exercises selected
          </p>
          {draft.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
              <Plus aria-hidden="true" className="mx-auto size-8 text-white/30" />
              <p className="mt-3 font-semibold text-white">Your draft is empty</p>
            </div>
          ) : (
            <ol className="mt-5 space-y-3" aria-label="Workout draft exercises">
              {draft.map((item, index) => {
                const exercise = exercisesById.get(item.exerciseId);
                const valid =
                  Number.isSafeInteger(item.sets) &&
                  item.sets >= MIN_SETS &&
                  item.sets <= MAX_SETS &&
                  Number.isSafeInteger(item.reps) &&
                  item.reps >= MIN_REPS &&
                  item.reps <= MAX_REPS;
                return (
                  <li key={item.exerciseId} className="rounded-xl border border-white/10 bg-black/15 p-4">
                    <h3 className="font-semibold break-words text-white">
                      {index + 1}. {exercise?.name ?? "Unknown exercise"}
                    </h3>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <label className="text-sm font-medium text-blue-50">
                        Sets
                        <input
                          type="number"
                          min={MIN_SETS}
                          max={MAX_SETS}
                          value={Number.isNaN(item.sets) ? "" : item.sets}
                          disabled={pending}
                          aria-invalid={!valid || undefined}
                          onChange={(event) => {
                            updateItem(index, { sets: event.target.valueAsNumber });
                          }}
                          className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-white"
                        />
                      </label>
                      <label className="text-sm font-medium text-blue-50">
                        Reps
                        <input
                          type="number"
                          min={MIN_REPS}
                          max={MAX_REPS}
                          value={Number.isNaN(item.reps) ? "" : item.reps}
                          disabled={pending}
                          aria-invalid={!valid || undefined}
                          onChange={(event) => {
                            updateItem(index, { reps: event.target.valueAsNumber });
                          }}
                          className="mt-2 min-h-11 w-full rounded-lg border border-white/15 bg-black/20 px-3 py-2 text-white"
                        />
                      </label>
                    </div>
                    {!valid && <p className="mt-2 text-xs text-red-200">Use whole values: sets 1–99 and reps 1–999.</p>}
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setReplacingIndex((current) => (current === index ? null : index));
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-amber-300/25 px-2 py-2 text-xs text-amber-100 disabled:opacity-35"
                        aria-label={`Replace ${exercise?.name ?? "exercise"}`}
                      >
                        <Replace aria-hidden="true" className="size-4" />
                        {replacingIndex === index ? "Replacing" : "Replace"}
                      </button>
                      <button
                        type="button"
                        disabled={index === 0 || pending}
                        onClick={() => {
                          moveItem(index, "up");
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-white/15 px-2 py-2 text-xs text-blue-50 disabled:opacity-35"
                        aria-label={`Move ${exercise?.name ?? "exercise"} up`}
                      >
                        <ArrowUp aria-hidden="true" className="size-4" />
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={index === draft.length - 1 || pending}
                        onClick={() => {
                          moveItem(index, "down");
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-white/15 px-2 py-2 text-xs text-blue-50 disabled:opacity-35"
                        aria-label={`Move ${exercise?.name ?? "exercise"} down`}
                      >
                        <ArrowDown aria-hidden="true" className="size-4" />
                        Down
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          onChange(removeDraftItem(draft, item.exerciseId));
                          if (replacingIndex === index) setReplacingIndex(null);
                          else if (replacingIndex !== null && replacingIndex > index)
                            setReplacingIndex(replacingIndex - 1);
                        }}
                        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-red-300/25 px-2 py-2 text-xs text-red-200 disabled:opacity-35"
                        aria-label={`Remove ${exercise?.name ?? "exercise"}`}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-6 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row-reverse">
            <button
              type="button"
              disabled={!draftValid || pending}
              onClick={onSave}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              {pending ? "Saving…" : saveLabel}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onCancel}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-blue-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Cancel
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
