import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import WorkoutHistory from "@/components/workouts/WorkoutHistory";
import type { WorkoutHistoryPage } from "@/lib/workout-history-client";

const historyPage: WorkoutHistoryPage = {
  entries: [
    {
      id: "00000000-0000-0000-0000-000000000101",
      origin: "manual",
      createdAt: "2026-09-08T09:00:00.000Z",
      completedAt: "2026-09-09T10:30:00.000Z",
      exercises: [
        {
          exerciseId: "00000000-0000-0000-0000-000000000201",
          name: "Barbell Bench Press",
          position: 0,
          sets: 3,
          reps: 10,
          muscles: [
            { code: "chest", name: "Chest", role: "primary" },
            { code: "triceps", name: "Triceps", role: "secondary" },
          ],
        },
        {
          exerciseId: "00000000-0000-0000-0000-000000000202",
          name: "Cable Row",
          position: 1,
          sets: 4,
          reps: 8,
          muscles: [
            { code: "upper_back", name: "Upper Back", role: "primary" },
            { code: "biceps", name: "Biceps", role: "secondary" },
          ],
        },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000102",
      origin: "ai",
      createdAt: "2026-09-07T09:00:00.000Z",
      completedAt: "2026-09-08T10:30:00.000Z",
      exercises: [
        {
          exerciseId: "00000000-0000-0000-0000-000000000203",
          name: "Bodyweight Squat",
          position: 0,
          sets: 3,
          reps: 12,
          muscles: [{ code: "quads", name: "Quads", role: "primary" }],
        },
      ],
    },
  ],
  nextCursor: null,
};

function workoutCard(workouts: HTMLElement, title: string) {
  const card = within(workouts).getByText(title).closest("li");
  if (!card) throw new Error(`Could not find the ${title} card.`);
  return card;
}

test("shows completed workout summaries and toggles each complete saved prescription", async () => {
  const user = userEvent.setup();
  render(
    <WorkoutHistory
      initialFilters={{ muscles: [], equipment: [] }}
      initialPage={historyPage}
      muscleOptions={[
        { code: "chest", name: "Chest", role: "primary" },
        { code: "triceps", name: "Triceps", role: "secondary" },
        { code: "upper_back", name: "Upper Back", role: "primary" },
        { code: "biceps", name: "Biceps", role: "secondary" },
        { code: "quads", name: "Quads", role: "primary" },
      ]}
    />,
  );

  const completedWorkouts = screen.getByRole("list", { name: "Completed workouts" });
  const manualCard = workoutCard(completedWorkouts, "Manual workout");
  const aiCard = workoutCard(completedWorkouts, "AI workout");

  expect(within(manualCard).getByText("2 exercises")).toBeTruthy();
  expect(within(manualCard).getByText("Chest")).toBeTruthy();
  expect(within(manualCard).getByText("Upper Back")).toBeTruthy();
  expect(within(aiCard).getByText("1 exercise")).toBeTruthy();
  expect(within(aiCard).getByText("Quads")).toBeTruthy();
  expect(screen.queryByRole("list", { name: "Manual workout prescription" })).toBeNull();
  expect(screen.queryByRole("list", { name: "AI workout prescription" })).toBeNull();

  await user.click(within(manualCard).getByRole("button", { name: "Show details" }));
  const manualPrescription = screen.getByRole("list", { name: "Manual workout prescription" });
  expect(within(manualCard).getByText("Origin: Manual", { exact: false })).toBeTruthy();
  expect(within(manualPrescription).getByText("1. Barbell Bench Press")).toBeTruthy();
  expect(within(manualPrescription).getByText("3 sets × 10 reps")).toBeTruthy();
  expect(within(manualPrescription).getByText("Chest · primary")).toBeTruthy();
  expect(within(manualPrescription).getByText("Triceps · secondary")).toBeTruthy();
  expect(within(manualPrescription).getByText("2. Cable Row")).toBeTruthy();
  expect(within(manualPrescription).getByText("4 sets × 8 reps")).toBeTruthy();
  expect(within(manualPrescription).getByText("Upper Back · primary")).toBeTruthy();
  expect(within(manualPrescription).getByText("Biceps · secondary")).toBeTruthy();

  await user.click(within(aiCard).getByRole("button", { name: "Show details" }));
  const aiPrescription = screen.getByRole("list", { name: "AI workout prescription" });
  expect(within(aiCard).getByText("Origin: AI-generated", { exact: false })).toBeTruthy();
  expect(within(aiPrescription).getByText("1. Bodyweight Squat")).toBeTruthy();
  expect(within(aiPrescription).getByText("3 sets × 12 reps")).toBeTruthy();
  expect(within(aiPrescription).getByText("Quads · primary")).toBeTruthy();

  await user.click(within(manualCard).getByRole("button", { name: "Hide details" }));
  expect(screen.queryByRole("list", { name: "Manual workout prescription" })).toBeNull();
  expect(screen.getByRole("list", { name: "AI workout prescription" })).toBe(aiPrescription);
});
