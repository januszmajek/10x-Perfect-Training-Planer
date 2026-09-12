# Shared Muscle Filter Role Facets — Plan Brief

> Full plan: `context/changes/shared-muscle-filter-role-facets/plan.md`
> Frame brief: `context/changes/shared-muscle-filter-role-facets/frame.md`

## What & Why

This change resolves a UI-contract defect: two role-labelled controls currently represent one role-agnostic muscle filter. It replaces them with one clear `Muscles` list on the workout catalogue and History pages.

## Starting Point

Both surfaces store selected muscle codes without roles, while their UI derives role-labelled option lists. A code occurring in both roles is therefore displayed twice and visibly shares a selected state.

## Desired End State

Users see every muscle once under `Muscles`, with no confusing linked checkbox in a second role group. Selecting it continues to find exercises and History entries tagged with that muscle in either role, and saved muscle-filter URLs continue to work.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Filter model | Keep role-agnostic | It is the established, tested matching contract and needs no API or URL change. | Frame |
| UI presentation | One de-duplicated `Muscles` facet | The UI should not imply independent role filters it cannot express. | Plan |
| Explanatory copy | None | A single unambiguous list needs no extra visual weight. | Plan |
| Test scope | Update existing tests only | Existing UI and E2E coverage must remain valid; no new scenarios were requested. | Plan |

## Scope

**In scope:**

- One deduplicated filter list on catalogue and History.
- Existing component, client, and E2E test updates.
- Active change documentation.

**Out of scope:**

- Role-specific filtering, schema/API/URL changes, new tests, and changes to role labels in workout details.

## Architecture / Approach

The UI option boundary becomes code/name based rather than role/code based. Selection state, query serialization, server matching, and detail data remain exactly as they are.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Catalogue facet | One catalogue `Muscles` list | Regressing shared selected-code state |
| 2. History facet | One History `Muscles` list | Losing detail roles or History state behavior |
| 3. Regression coverage | Updated existing UI/E2E locators and records | Breaking required CI browser gates |

**Prerequisites:** Existing Playwright and local Supabase harness remain available.
**Estimated effort:** One focused implementation session across three small phases.

## Open Risks & Assumptions

- The existing one-name-per-muscle-code catalogue invariant remains true.
- CI E2E verification must use state/intersection assertions rather than cross-host visual baselines, per `lessons.md`.

## Success Criteria (Summary)

- Catalogue and History each show one `Muscles` facet with no cross-role duplicate checkbox.
- Role-agnostic filters, canonical URLs, reload, and History navigation still work.
- Existing required UI and E2E suites pass in CI-equivalent conditions.
