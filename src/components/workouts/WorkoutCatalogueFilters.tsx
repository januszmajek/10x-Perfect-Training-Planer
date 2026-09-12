import { ArrowLeft, Search } from "lucide-react";
import type { EquipmentType } from "@/lib/manual-workout-builder";

interface Props {
  open: boolean;
  active: boolean;
  search: string;
  selectedMuscles: string[];
  selectedEquipment: EquipmentType[];
  muscles: [string, string][];
  equipment: EquipmentType[];
  onClose: () => void;
  onReset: () => void;
  onSearchChange: (value: string) => void;
  onToggleMuscle: (code: string) => void;
  onToggleEquipment: (equipment: EquipmentType) => void;
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function OptionGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: [string, string][];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <details className="rounded-xl border border-white/10 bg-black/10 p-4">
      <summary className="cursor-pointer text-sm font-semibold text-white">
        {label} ({options.filter(([value]) => selected.includes(value)).length} selected)
      </summary>
      <fieldset>
        <legend className="sr-only">{label}</legend>
        {options.map(([value, name]) => (
          <label key={value} className="mt-2 flex min-h-10 items-center gap-3 text-sm text-blue-100/75">
            <input
              type="checkbox"
              checked={selected.includes(value)}
              onChange={() => {
                onToggle(value);
              }}
              className="size-4 accent-purple-500"
            />
            {name}
          </label>
        ))}
      </fieldset>
    </details>
  );
}

export default function WorkoutCatalogueFilters({
  open,
  active,
  search,
  selectedMuscles,
  selectedEquipment,
  muscles,
  equipment,
  onClose,
  onReset,
  onSearchChange,
  onToggleMuscle,
  onToggleEquipment,
}: Props) {
  return (
    <>
      {open && (
        <button aria-label="Close filters" className="fixed inset-0 z-[100] bg-black/60 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-[110] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-r-2xl border border-white/10 bg-slate-950 p-4 shadow-2xl transition-transform duration-300 lg:static lg:w-auto lg:translate-x-0 lg:overflow-visible lg:rounded-2xl lg:bg-white/5 lg:p-6 lg:shadow-none ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <button
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            className="inline-flex size-10 items-center justify-center rounded-lg border border-white/15 text-blue-50 lg:hidden"
          >
            <ArrowLeft aria-hidden="true" className="size-5" />
          </button>
          <h2 className="mr-auto text-xl font-bold text-white">Filters</h2>
          <button
            type="button"
            disabled={!active}
            onClick={onReset}
            className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-blue-50 transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Reset filters
          </button>
        </div>
        <label htmlFor="exercise-search" className="mt-4 block text-sm font-medium text-blue-50">
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
              onSearchChange(event.target.value);
            }}
            className="min-h-11 w-full rounded-lg border border-white/15 bg-black/20 py-2 pr-3 pl-10 text-white"
            placeholder="e.g. squat"
          />
        </div>
        <div className="mt-4 grid gap-4">
          <OptionGroup label="Muscles" options={muscles} selected={selectedMuscles} onToggle={onToggleMuscle} />
          <OptionGroup
            label="Equipment"
            options={equipment.map((value) => [value, formatLabel(value)])}
            selected={selectedEquipment}
            onToggle={(value) => {
              onToggleEquipment(value as EquipmentType);
            }}
          />
        </div>
      </aside>
    </>
  );
}
