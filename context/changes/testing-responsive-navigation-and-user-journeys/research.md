---
date: 2026-09-11T13:11:13+02:00
researcher: Codex
git_commit: f79cd1ca697d48dfde82fdb224a812b20cffe754
branch: master
repository: 10x-Perfect-Training-Planer
topic: "Ground rollout Phase 2: responsive navigation and user journeys (risks #1, #2, #5)"
tags: [research, testing, e2e, responsive-navigation, workout-journeys, history]
status: complete
last_updated: 2026-09-11
last_updated_by: Codex
last_updated_note: "Recorded planning decisions: intentional new-draft discard, targeted production fixes, no focus-trap expansion."
---

# Research: Responsive navigation and user journeys

**Date**: 2026-09-11T13:11:13+02:00  
**Researcher**: Codex  
**Git commit**: `f79cd1ca697d48dfde82fdb224a812b20cffe754`  
**Branch**: `master`  
**Repository**: `10x-Perfect-Training-Planer`

## Research Question

Ground Phase 2 of `context/foundation/test-plan.md` for risks #1, #2, and #5. Trace actual failure paths rather than treating `src/components/workouts/` as an anchor; locate current tests; validate the proposed response; and select the cheapest useful test layer.

## Summary

Phase 1's Vitest/jsdom suite deliberately covers controlled component seams, not routes, hydrated React islands, browser history, CSS breakpoints, native dialogs, or focus/scroll lifecycle. There is no repository browser harness or browser-test script. A small authenticated browser suite is therefore the cheapest layer that can establish the Phase 2 claims; more unit tests or snapshots would not do so.

The guidance needs two corrections:

1. New-workout drafts are intentionally volatile. Navigation/Back restoration must prove the documented reset/discard contract, not universally promise preservation. Edit has an explicit dirty-discard dialog, but create can lose a draft through ordinary sidebar/mobile links.
2. “Equivalent interactions” must be narrowed. Catalogue and History intentionally share all-selected muscle semantics and similar responsive filter-drawer lifecycle, but they do not share cards, dialogs, search/date semantics, or browser-history behavior. Treating those as one contract would test an invented requirement.

The most important concrete defects/gaps to drive the plan are:

- An open mobile navigation portal survives a resize from below `sm` to desktop because its portal has no breakpoint/resize reconciliation.
- Mobile catalogue and History drawers restore focus on close but neither moves focus into the drawer nor traps it; background controls remain reachable by Tab.
- Catalogue criteria use `replaceState` without a `popstate` handler, while History reparses/refetches on `popstate`. They are not equivalent Back/Forward implementations.

## Detailed Findings

### Risk #1 — journeys, navigation, durable versus volatile state

#### Actual journey ownership and failure paths

- Protected document routes are guarded in `src/middleware.ts:15-35`. Its key behavior is: `"return context.redirect(\"/auth/signin\");"` for an unauthenticated protected request and `"return context.redirect(\"/dashboard\");"` for authenticated auth-entry requests. `src/pages/api/auth/signin.ts:13-19` also sends every successful sign-in to Dashboard. This is a real authentication journey seam, but failure to return users to the originally requested route is only a defect if that is a product requirement.
- `/workouts/new` loads the catalogue/current plan server-side and hydrates `WorkoutBuilder` (`src/pages/workouts/new.astro:15-32,43-50`). The create draft is local-only: `const [draft, setDraft] = useState<ManualWorkoutDraftItem[]>([])` (`src/components/workouts/WorkoutBuilder.tsx:89`). Generation replaces it only after a parsed valid transition (`129-168`), and save chooses either the manual or AI endpoint (`206-232`).
- On success, the builder follows the server redirect with `window.location.assign(response.url)` (`WorkoutBuilder.tsx:234-236`). The manual save endpoint persists then returns `303 /dashboard?status=workout-saved` (`src/pages/api/workouts/manual.ts:20-32`); the AI endpoint has the same redirect boundary (`src/pages/api/workouts/ai/save.ts:21-50`). A dashboard success toast is therefore not evidence that the next lifecycle stage works.
- The create Cancel action unconditionally navigates to Dashboard (`WorkoutBuilder.tsx:365-391`). Unlike edit, it has no dirty calculation, `beforeunload` hook, or leave confirmation. Sidebar and mobile links are ordinary anchors (`src/components/SidebarNavigation.tsx:60-84`, `src/components/MobileNavigation.tsx:139-156`), so any such navigation silently discards the in-memory draft. Archived requirements explicitly chose active-island-only new drafts and Cancel-discard behavior (`context/archive/2026-09-01-manual-workout-create-and-save/plan.md:34-35,400-403`), and the navigation work explicitly resets transient drafts on BFCache restoration (`context/archive/2026-09-10-navigation/plan-brief.md:7-12,22-27`). This is a contract to prove, not automatically a bug to “fix.”
- Edit has the materially different contract. `PlannedWorkoutEditor` tracks draft, baseline, and dirty state (`src/components/workouts/PlannedWorkoutEditor.tsx:60-77`), opens a discard dialog for in-app Cancel when dirty (`201-221,311-340`), and only installs `beforeunload` while dirty (`79-91`). The native prompt itself is not a reliable E2E assertion; the explicit discard dialog is.
- Completion is a second transaction boundary. `PlannedWorkoutSummary` PATCHes with expected ID/revision (`src/components/workouts/PlannedWorkoutSummary.tsx:187-203`), reconciles ambiguous outcomes with a fresh GET (`151-219`), and redirects on completion. Dashboard says the completed workout “moved to History” (`src/pages/dashboard.astro:80-86`), but only a subsequent History route read and rendered card prove that outcome (`src/pages/history.astro:13-33,43-50`).
- Catalogue URL criteria are serialized with `history.replaceState` (`src/components/workouts/WorkoutDraftEditor.tsx:123-131`) and canonicalized on new/edit SSR (`src/pages/workouts/new.astro:21-32`, `src/pages/workouts/edit.astro:27-38`). History also writes committed filters with `replaceState` (`src/components/workouts/WorkoutHistory.tsx:186-245`) but, unlike the catalogue, reparses and refetches after `popstate` (`260-277`). The archived navigation matrix deliberately specifies query retention but transient draft/dialog reset (`context/archive/2026-09-10-navigation/plan.md:28-36,64-72`).

#### Existing tests and cheapest useful layer

Existing Node tests prove individual parsing/reconciliation/reducer behavior (`src/lib/planned-workout-client.test.ts`, `src/lib/planned-workout-completion.test.ts`, `src/lib/workout-history-client.test.ts`). Phase 1's `src/components/workouts/WorkoutHistory.test.tsx` proves static Show/Hide detail. No test targets `WorkoutBuilder`, `PlannedWorkoutEditor`, `PlannedWorkoutSummary`, auth navigation, BFCache, a real redirect, or save → complete → History. `package.json` exposes Node and `test:ui` scripts only; no Playwright/Cypress/WebDriver dependency/configuration is installed.

**Verdict:** the response guidance is correct only when “preserve state” distinguishes durable saved work from specified volatile-draft reset. Use focused authenticated browser E2E with deterministic seeded local user/data and a controlled AI/provider boundary. Assert locators, response-driven UI, and URL changes—not sleeps. Minimum useful journeys are:

- sign-in → dashboard → Back, asserting the auth-entry/back contract;
- manual create/save → edit → completion → History rendered card;
- AI generation → edit → save → same completion/history chain;
- failed save retains the visible draft;
- Back/Forward confirms URL criteria rehydrate while transient drawer/dialog/draft state follows the documented reset contract;
- create-draft navigation explicitly asserts discard, unless the product decision changes to require a guard.

### Risk #2 — 360px and desktop reachability

#### Actual responsive and overlay seams

- `AuthenticatedLayout` swaps global navigation at `sm`: the mobile header is `sm:hidden`, the sidebar is `sm:flex`, and `MobileNavigation` is the only 360px global navigation control (`src/layouts/AuthenticatedLayout.astro:25-43`). At desktop the sidebar is compact from `sm` through `xl`, then expanded (`src/components/SidebarNavigation.tsx:91-132`). Its compact controls are `size-11` and have accessible names (`40-85`), so reachability is plausible but unproven in a layout engine.
- The mobile trigger is inside a `sm:hidden` wrapper (`src/components/MobileNavigation.tsx:72-87`), but its drawer is portalled to `document.body` (`113-177`) with no responsive class or resize listener. Its `isOpen` state remains true through a resize; therefore the fixed `z-[100]` drawer can cover the desktop sidebar after 360px → desktop. This is a concrete counterexample to “desktop rendering proves responsiveness.”
- At 360px, the drawer width is `min(20rem, calc(100vw - 2rem))` and its height is `h-dvh` (`MobileNavigation.tsx:130-137`); the menu target is 44px and route links are padded (`73-87,139-172`). Browser interaction—not an image—must establish that a link is visible, clickable, and actually changes route.
- Open mobile navigation locks body scrolling, focuses the first link, supports Escape, and restores scroll on cleanup (`MobileNavigation.tsx:49-69`). Backdrop/trigger close return focus (`79-84,122-129`). But only the portal wrapper gets `inert` (`115-120`); application siblings remain focusable and there is no Tab trap. Test that focus enters, Tab cannot reach background, and close restores focus; current code is likely to fail the middle condition.
- Workout builder layout changes from one column to three at `xl` (`WorkoutDraftEditor.tsx:171`); filter controls are a fixed drawer below `lg` and static aside at `lg+` (`src/components/workouts/WorkoutCatalogueFilters.tsx:80-151`; trigger in `WorkoutCataloguePanel.tsx:71-79`). The parent supplies Escape, scroll lock, and trigger-focus restoration (`WorkoutDraftEditor.tsx:107-121`) but does not focus into or make the drawer modal.
- History independently repeats the fixed-to-static drawer structure (`WorkoutHistory.tsx:469-506,596-606`) and escape/scroll/focus-return behavior (`279-293`). It needs separate coverage; visual similarity is not behavioral proof. Native workout dialogs do receive browser modal behavior and have responsive widths/action stacking (`PlanReplacementDialog.tsx:26-65`, `ReducedWorkoutConfirmationDialog.tsx:20-59`, `PlannedWorkoutEditor.tsx:231-353`).

#### Existing tests and cheapest useful layer

Vitest/jsdom is configured (`vitest.config.ts:10-19`) but has no CSS/Tailwind layout or viewport engine. Component tests exercise callbacks only: catalogue filters (`WorkoutCatalogueFilters.test.tsx:53-87`), catalogue cards/panel (`WorkoutCataloguePanel.test.tsx:33-74`), and History detail (`WorkoutHistory.test.tsx:65-114`). There are no navigation, media-query, geometry, actual-focus, overflow, or viewport tests.

**Verdict:** browser assertions plus one or two stable visual checkpoints are right; amend the guidance to require focus entering the overlay, background exclusion, close restoration, and resize reconciliation. At 360px and a desktop viewport, prove controls are visible/enabled/clickable and routes/actions complete. Add an explicit open-mobile-drawer → resize-desktop case. Use geometry/locator checks for critical controls and only stable visual diffs for the open navigation drawer and one high-risk filter/dialog surface; do not add a broad screenshot suite.

### Risk #5 — observable equivalence, not shared code or appearance

#### What is actually equivalent

- The shared filter semantic is all-selected muscle matching: `matchesAllSelectedMuscles` returns `selected.every((muscle) => exerciseMuscles.includes(muscle))` (`src/lib/muscle-filter.ts:5-14`). Catalogue applies it via `filterCatalogue` (`src/lib/manual-workout-builder.ts:77-87`), while History applies the equivalent intersection at its database query boundary (`src/lib/workout-history.ts:143-158`). Pure tests cover catalogue intersection (`manual-workout-builder.test.ts:69-89`) and History URL canonicalization (`workout-history-client.test.ts:78-132`).
- Catalogue and History use independently owned UI state. Catalogue owns search, muscle/equipment criteria, local drawer state, and client-side result filtering (`WorkoutDraftEditor.tsx:54-67,107-131`); History owns dates, criteria, asynchronous request/page state, expanded cards, and a debounced fetch (`WorkoutHistory.tsx:138-165,295-321,664-750`).
- Their URL interactions differ. Catalogue writes `replaceState` and has no `popstate` handler (`WorkoutDraftEditor.tsx:123-131`); History writes after a successful replacement request and handles `popstate` by parsing, updating controls, and refetching (`WorkoutHistory.tsx:186-245,260-277`). Neither `replaceState` creates Back entries. A requirement that both preserve/restore browser navigation alike is false today and needs an explicit product decision before implementation.
- Cards are intentionally different. Catalogue cards mutate a draft through Add/Added/Replace/Current actions (`WorkoutCataloguePanel.tsx:104-135`, `WorkoutCatalogueExerciseCard.tsx:82-95`); History cards disclose immutable saved prescriptions (`WorkoutHistory.tsx:664-750`). Dialogs occur only in workout creation/editing/replacement; a cross-page “dialog equivalence” contract is speculative.
- The mobile filter drawers look parallel and both implement Escape, body scroll lock, and close-focus return (`WorkoutDraftEditor.tsx:107-121`, `WorkoutHistory.tsx:279-293`), but neither gives the aside dialog semantics or traps focus. This is the appropriate cross-page observable lifecycle contract.

#### Existing tests and cheapest useful layer

Phase 1 deliberately tests only controlled catalogue controls and static History detail: `WorkoutCatalogueFilters.test.tsx:53-87` and `WorkoutHistory.test.tsx:65-115`. Its plan explicitly excludes browser navigation, responsive behavior, native dialogs, History networking, and pagination (`context/archive/2026-09-10-testing-high-signal-ui-contracts/plan.md:27-31`). There is no test for `src/lib/workout-catalogue-navigation.ts` or route-level filter history.

**Verdict:** retain rendered component integration for the narrow existing card/control contracts, but add focused browser coverage for the cross-route contracts that cannot be observed in jsdom:

- apply the shared muscle/equipment criteria on each route and assert visible result, canonical URL, then reload and assert URL-derived state;
- exercise History Back/Forward restoration; decide explicitly whether catalogue must gain comparable behavior rather than silently testing an absent feature;
- at 360px, test each filter drawer’s open, Escape/backdrop/close, focus return, scroll restoration, and focus containment.

Use fixture-declared visible outcomes. Do not call production filter helpers to derive expected results, assert implementation details, use snapshots, or force unrelated search/date/card/dialog semantics into a false shared contract.

## Hot-spot Assessment

`src/components/workouts/` is useful likelihood evidence: it contains both feature drawers, create/edit/replacement dialogs, card behavior, and the History island. It is misleading as an anchor for all three risks. The global responsive-navigation defect is in `src/components/MobileNavigation.tsx`, `src/components/SidebarNavigation.tsx`, and `src/layouts/AuthenticatedLayout.astro`; durable state and URL contracts also cross `src/pages/` and `src/lib/`. The risk is architectural and journey-level, not confined to the hot-spot directory.

## Architecture Insights

- Astro SSR owns protected route entry, canonical query redirects, and fresh data reads. `client:load` React islands own volatile interaction state. Browser coverage must cross that seam.
- `replaceState` represents canonical current criteria, not a visit history model. Browser Back/Forward expectations must be stated route by route.
- Native dialogs and custom side drawers have different platform guarantees. A native dialog inherits modal behavior; a custom drawer must supply focus behavior explicitly.
- The current test stack is intentionally layered: Node proves domain/request logic, Vitest proves selected rendered component contracts, and the missing browser layer is narrowly justified by navigation, CSS, focus, route, and persistence claims.

## Historical Context

- `context/archive/2026-09-10-testing-high-signal-ui-contracts/plan.md` records the Phase 1 boundary: jsdom UI contracts were intentional and browser/visual/responsive/drawer/native-dialog work was deferred to this phase.
- `context/archive/2026-09-10-navigation/plan.md` specifies canonical query retention with transient draft/dialog reset, and its manual verification matrix calls out private dialog, sign-out, and URL navigation behavior.
- `context/archive/2026-09-03-muscle-filter-all-semantics/plan.md` supports the all-selected-muscle and drawer lifecycle contract, not identical cards, dialogs, or navigation across routes.
- GitHub permalinks were not generated: the repository API was unreachable during research. References above use stable repository paths and the recorded commit.

## Related Research

- `context/archive/2026-09-10-testing-high-signal-ui-contracts/test-audit.md`
- `context/archive/2026-09-10-testing-high-signal-ui-contracts/plan-brief.md`

## Open Questions

Planning decisions recorded after research:

1. New-workout drafts intentionally discard on ordinary in-app navigation; Phase 2 tests that contract and does not add a leave guard.
2. Phase 2 includes production fixes for confirmed defects exposed by browser coverage, beginning with resize-safe global navigation. It does not invent matching Back/Forward semantics for catalogue and History.
3. Keep the existing Escape/backdrop/scroll/focus-return drawer behavior, but do not add focus-trap or full modal-containment work in this rollout.
