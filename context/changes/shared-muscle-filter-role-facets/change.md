---
id: shared-muscle-filter-role-facets
status: impl_reviewed
created: 2026-09-12
updated: 2026-09-12
---

# Shared muscle filter role facets

Clarify or revise the misleading primary/secondary filter presentation on the workout catalogue and History pages.

## Implementation decisions

- The `Reset filters` control remains visible on both catalogue and History filter panels at all times. It is disabled
  when no filters are active, preserving its fixed right-aligned position and making the available reset action
  discoverable without layout movement.
