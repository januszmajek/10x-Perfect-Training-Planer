import { useEffect, useMemo, useRef, useState } from "react";
import WorkoutCatalogueFilters from "@/components/workouts/WorkoutCatalogueFilters";
import WorkoutCataloguePanel from "@/components/workouts/WorkoutCataloguePanel";
import WorkoutDraftPanel from "@/components/workouts/WorkoutDraftPanel";
import { getAiWorkoutDraftInteraction, type AiWorkoutDraftInteraction } from "@/lib/ai-workout-planner-state";
import {
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
import type { AiWorkoutFeedbackControls } from "@/lib/ai-workout-feedback-client";

interface Props<T extends CatalogueExercise> {
  catalogue: T[];
  draft: ManualWorkoutDraftItem[];
  pending: boolean;
  saveLabel: string;
  error?: string | null;
  originalProposalExerciseIds?: readonly string[];
  feedback?: AiWorkoutFeedbackControls;
  preferenceError?: string | null;
  onChange: (draft: ManualWorkoutDraftItem[]) => void;
  onInteraction?: (interaction: AiWorkoutDraftInteraction) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function WorkoutDraftEditor<T extends CatalogueExercise>({
  catalogue,
  draft,
  pending,
  saveLabel,
  error,
  originalProposalExerciseIds = [],
  feedback,
  preferenceError = null,
  onChange,
  onInteraction,
  onSave,
  onCancel,
}: Props<T>) {
  const [search, setSearch] = useState("");
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentType[]>([]);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const knownExerciseIds = useMemo(() => new Set(catalogue.map(({ id }) => id)), [catalogue]);
  const exercisesById = useMemo(() => new Map(catalogue.map((exercise) => [exercise.id, exercise])), [catalogue]);
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
  const replacingExercise = replacingIndex === null ? null : draft[replacingIndex];
  const replacingExerciseName = replacingExercise ? exercisesById.get(replacingExercise.exerciseId)?.name : null;
  const originalProposalExerciseIdSet = useMemo(
    () => new Set(originalProposalExerciseIds),
    [originalProposalExerciseIds],
  );

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

  function selectExercise(exerciseId: string) {
    if (replacingIndex !== null) {
      const replacedExerciseId = draft[replacingIndex]?.exerciseId;
      if (replacedExerciseId) {
        const interaction = getAiWorkoutDraftInteraction(originalProposalExerciseIdSet, {
          type: "swap",
          exerciseId: replacedExerciseId,
          replacementExerciseId: exerciseId,
        });
        if (interaction) onInteraction?.(interaction);
      }
      onChange(replaceDraftItem(draft, replacingIndex, exerciseId));
      setReplacingIndex(null);
      return;
    }
    onChange(addDraftItem(draft, exerciseId));
  }

  function removeItem(index: number, exerciseId: string) {
    const interaction = getAiWorkoutDraftInteraction(originalProposalExerciseIdSet, { type: "remove", exerciseId });
    if (interaction) onInteraction?.(interaction);
    onChange(removeDraftItem(draft, exerciseId));
    if (replacingIndex === index) setReplacingIndex(null);
    else if (replacingIndex !== null && replacingIndex > index) setReplacingIndex(replacingIndex - 1);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}
      {preferenceError && (
        <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {preferenceError}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)_minmax(20rem,0.85fr)] xl:items-start">
        <WorkoutCatalogueFilters
          open={filtersOpen}
          active={filtersActive}
          search={search}
          selectedMuscles={selectedMuscles}
          selectedEquipment={selectedEquipment}
          primaryMuscles={primaryMuscleOptions}
          secondaryMuscles={secondaryMuscleOptions}
          equipment={equipmentOptions}
          onClose={() => {
            setFiltersOpen(false);
          }}
          onReset={() => {
            setSearch("");
            setSelectedMuscles([]);
            setSelectedEquipment([]);
          }}
          onSearchChange={setSearch}
          onToggleMuscle={(code) => {
            setSelectedMuscles((items) =>
              items.includes(code) ? items.filter((item) => item !== code) : [...items, code],
            );
          }}
          onToggleEquipment={(equipment) => {
            setSelectedEquipment((items) =>
              items.includes(equipment) ? items.filter((item) => item !== equipment) : [...items, equipment],
            );
          }}
        />
        <WorkoutCataloguePanel
          catalogue={catalogue}
          filteredCatalogue={filteredCatalogue}
          draft={draft}
          replacingIndex={replacingIndex}
          pending={pending}
          feedback={feedback}
          filterTriggerRef={filterTriggerRef}
          onOpenFilters={() => {
            setFiltersOpen(true);
          }}
          onSelectExercise={selectExercise}
        />
        <WorkoutDraftPanel
          draft={draft}
          exercisesById={exercisesById}
          replacingIndex={replacingIndex}
          replacingExerciseName={replacingExerciseName ?? null}
          pending={pending}
          draftValid={draftValid}
          saveLabel={saveLabel}
          onCancelReplace={() => {
            setReplacingIndex(null);
          }}
          onToggleReplace={(index) => {
            setReplacingIndex((current) => (current === index ? null : index));
          }}
          onUpdateItem={(index, update) => {
            onChange(draft.map((item, itemIndex) => (itemIndex === index ? { ...item, ...update } : item)));
          }}
          onMoveItem={(index, direction) => {
            onChange(moveDraftItem(draft, index, direction));
          }}
          onRemoveItem={removeItem}
          onSave={onSave}
          onCancel={onCancel}
        />
      </div>
    </div>
  );
}
