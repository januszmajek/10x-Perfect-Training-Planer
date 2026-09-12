import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import WorkoutCatalogueFilters from "@/components/workouts/WorkoutCatalogueFilters";
import { catalogueCallbacks } from "@/test/ui/workout-fixtures";

function renderFilters(active = true) {
  const callbacks = catalogueCallbacks();
  function ControlledFilters() {
    const [search, setSearch] = useState("bench");
    const [selectedMuscles, setSelectedMuscles] = useState(["chest"]);
    const [selectedEquipment, setSelectedEquipment] = useState(["barbell"]);
    const toggle = (values: string[], value: string) =>
      values.includes(value) ? values.filter((item) => item !== value) : [...values, value];

    return (
      <WorkoutCatalogueFilters
        open
        active={active}
        search={search}
        selectedMuscles={selectedMuscles}
        selectedEquipment={selectedEquipment}
        muscles={[
          ["chest", "Chest"],
          ["triceps", "Triceps"],
        ]}
        equipment={["barbell", "cable"]}
        onClose={callbacks.onClose}
        onReset={() => {
          callbacks.onReset();
          setSearch("");
          setSelectedMuscles([]);
          setSelectedEquipment([]);
        }}
        onSearchChange={(value) => {
          callbacks.onSearchChange(value);
          setSearch(value);
        }}
        onToggleMuscle={(value) => {
          callbacks.onToggleMuscle(value);
          setSelectedMuscles((current) => toggle(current, value));
        }}
        onToggleEquipment={(value) => {
          callbacks.onToggleEquipment(value);
          setSelectedEquipment((current) => toggle(current, value));
        }}
      />
    );
  }

  render(<ControlledFilters />);
  return callbacks;
}

test("reflects controlled filters and sends visible interactions to their callbacks", async () => {
  const user = userEvent.setup();
  const callbacks = renderFilters();

  const search = screen.getByLabelText("Search by name");
  expect(search.value).toBe("bench");
  expect(screen.getByText("Muscles (1 selected)")).toBeTruthy();
  expect(screen.getByLabelText("Chest").checked).toBe(true);
  expect(screen.getByLabelText("Barbell").checked).toBe(true);

  await user.clear(search);
  await user.type(search, "row");
  await user.click(screen.getByLabelText("Triceps"));
  await user.click(screen.getByLabelText("Cable"));
  await user.click(screen.getByRole("button", { name: "Reset filters" }));

  expect(callbacks.onSearchChange).toHaveBeenLastCalledWith("row");
  expect(callbacks.onToggleMuscle).toHaveBeenCalledWith("triceps");
  expect(callbacks.onToggleEquipment).toHaveBeenCalledWith("cable");
  expect(callbacks.onReset).toHaveBeenCalledTimes(1);
  expect(search.value).toBe("");
});

test("keeps Reset visible but disabled without active filters and exposes both visible close controls", async () => {
  const user = userEvent.setup();
  const callbacks = renderFilters(false);

  expect(screen.getByRole("button", { name: "Reset filters" }).disabled).toBe(true);
  expect(screen.getAllByRole("button", { name: "Close filters" })).toHaveLength(2);

  for (const control of screen.getAllByRole("button", { name: "Close filters" })) {
    await user.click(control);
  }

  expect(callbacks.onClose).toHaveBeenCalledTimes(2);
});
import { useState } from "react";
