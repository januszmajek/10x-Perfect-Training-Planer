export interface MuscleTagged {
  code: string;
}

/**
 * A muscle-filter selection is an intersection: every selected group must occur
 * in the candidate's tags. Tag role is intentionally irrelevant here, so both
 * primary and secondary tags participate.
 */
export function matchesAllSelectedMuscles(tags: readonly MuscleTagged[], selectedMuscles: readonly string[]): boolean {
  if (selectedMuscles.length === 0) return true;

  const candidateMuscles = new Set(tags.map(({ code }) => code));
  return [...new Set(selectedMuscles)].every((code) => candidateMuscles.has(code));
}
