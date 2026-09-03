import type { MuscleOption, WorkoutHistoryFilters, WorkoutHistoryPage } from "@/lib/workout-history-client";

interface Props {
  initialFilters: WorkoutHistoryFilters;
  initialPage: WorkoutHistoryPage;
  muscleOptions: MuscleOption[];
}

export default function WorkoutHistory({ initialFilters, initialPage, muscleOptions }: Props) {
  const hasFilters = initialFilters.muscles.length > 0 || initialFilters.completedFrom !== undefined;

  return (
    <section aria-label="Completed workout history">
      <p className="text-sm text-blue-100/65" role="status">
        {initialPage.entries.length} {initialPage.entries.length === 1 ? "workout" : "workouts"}
        {hasFilters ? " match the current filters." : " loaded."}
      </p>
      {initialPage.entries.length === 0 ? (
        <p className="mt-5 rounded-xl border border-white/10 bg-black/15 px-4 py-3 text-sm leading-6 text-blue-100/70">
          No completed workouts match this view yet.
        </p>
      ) : (
        <ol className="mt-5 space-y-3" aria-label="Completed workouts">
          {initialPage.entries.map((entry) => (
            <li key={entry.id} className="rounded-xl border border-white/10 bg-black/15 p-4">
              <p className="font-semibold text-white">{entry.origin === "ai" ? "AI workout" : "Manual workout"}</p>
              <time className="mt-1 block text-sm text-blue-100/65" dateTime={entry.completedAt}>
                Completed{" "}
                {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                  new Date(entry.completedAt),
                )}
              </time>
              <p className="mt-2 text-sm text-blue-100/70">
                {entry.exercises.length} {entry.exercises.length === 1 ? "exercise" : "exercises"}
              </p>
            </li>
          ))}
        </ol>
      )}
      <p className="sr-only">{muscleOptions.length} muscle filter options are available after hydration.</p>
    </section>
  );
}
