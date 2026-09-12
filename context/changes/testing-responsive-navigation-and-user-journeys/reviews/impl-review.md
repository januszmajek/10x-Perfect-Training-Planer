<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Responsive Navigation and User Journeys Implementation Plan

- **Plan**: context/changes/testing-responsive-navigation-and-user-journeys/plan.md
- **Scope**: Phases 1-3 of 3
- **Date**: 2026-09-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations unresolved

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Browser runner can target inherited non-local Supabase settings

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/run-e2e.mjs:30
- **Detail**: The runner gives inherited `SUPABASE_*` and AI-secret environment variables precedence over the values obtained from local `supabase status`. A developer shell with a remote Supabase URL/key can therefore make the browser sign-up fixture write to that remote project before the local fixture query fails. This violates the plan's local-only fixture contract.
- **Fix**: Use the values returned by local Supabase unconditionally, or fail before starting when inherited values disagree; generate the test signing/encryption secrets unconditionally.
- **Decision**: FIXED — local Supabase values and fresh test-only secrets are now forced by the runner; `pnpm lint` and `pnpm test:e2e` passed.

### F2 — Playwright projects required by the plan are absent

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: playwright.config.ts:5
- **Detail**: Phase 1 specifies fixed 360px and desktop projects, with visual assertions pinned to Chromium. The current configuration has no projects and instead overrides viewport sizes inside individual specs.
- **Fix**: Define the planned Chromium projects and assign the responsive/visual tests to the appropriate project.
- **Decision**: FIXED — added fixed mobile and desktop Chromium projects; browser discovery assigns responsive checks to mobile and all other journeys to desktop.

### F3 — Drawer lifecycle contract omits backdrop coverage

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: e2e/responsive-navigation.spec.ts:49
- **Detail**: The plan requires Escape and backdrop close checks for the scoped drawers. The History drawer is closed with Escape and the Workout drawer by its close button, but no test clicks a backdrop or explicitly proves each close control is visible/actionable.
- **Fix**: Add focused backdrop-close and close-control assertions for the scoped drawer owners.
- **Decision**: FIXED — raised both filter drawers and their backdrops above Astro's transition layer; normal backdrop click now closes the drawer and restores scrolling, and the focused responsive suite passes.

### F4 — Desktop workout filter test does not operate a static filter control

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: e2e/responsive-navigation.spec.ts:72
- **Detail**: Phase 2 requires desktop static filter controls to remain reachable. The test only verifies that the workout filter aside is visible; it does not locate or use a desktop filter input/control.
- **Fix**: Exercise one visible desktop filter control and assert its observable result or URL effect.
- **Decision**: FIXED — the desktop test now operates the visible Chest filter and proves its canonical URL effect; focused responsive browser checks passed.

### F5 — Workout journey skips the grace-period transition assertion

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: e2e/workout-journeys.spec.ts:10
- **Detail**: The plan requires completion after the visible grace-period transition. The helper clicks `Mark done` immediately and only waits for the redirect, so that user-visible state is not asserted.
- **Fix**: Assert the visible grace-period control/state before marking the workout done.
- **Decision**: FIXED — manual and AI journeys now prove the visible grace-period toast and focused Undo control before completion; focused workout journeys passed (3 tests).

### F6 — History filter contract lacks result and Back/Forward assertions

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: e2e/history-filters.spec.ts:28
- **Detail**: Phase 3 requires fixture-declared filter output on both routes and History-only Back/Forward restoration. The test verifies a catalogue result, URL/reload state for both routes, but seeds/asserts no History result and never uses browser Back or Forward.
- **Fix**: Seed a matching History fixture, assert its filtered result, and add History Back/Forward restoration checks.
- **Decision**: FIXED — History now pushes individual filter states and the test observes each debounced transition before applying the next; the completed-history fixture, filtered card, reload, Back, and Forward assertions pass.

### F7 — Manual review claims have no committed evidence

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-responsive-navigation-and-user-journeys/plan.md:189
- **Detail**: The Phase 1, 2, and 3 manual checkboxes are marked complete, but the change contains no recorded runner output, review note, or failure-only artifact that demonstrates those manual inspections. This does not invalidate the passing automated suite but makes the claims unreviewable.
- **Fix**: Add concise, secret-free manual verification notes or links to retained review evidence when completing future phases.
- **Decision**: FIXED — `manual-verification.md` now records the 2026-09-12 live narrow-browser review and a retained
  controlled-failure trace review, including the exact public diagnostics and credential scan result.

### F8 — Build requires host network-interface access in this environment

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: package.json:26
- **Detail**: `pnpm build` failed under the restricted sandbox because Cloudflare's Vite plugin could not read network interfaces, then passed unchanged outside that restriction. This is environmental, not a product-build failure.
- **Fix**: Treat the host-context build as the authoritative result for this environment.
- **Decision**: FIXED — no code change required; the production build was verified successfully in the host context, which has the network-interface access required by the Cloudflare Vite plugin.
