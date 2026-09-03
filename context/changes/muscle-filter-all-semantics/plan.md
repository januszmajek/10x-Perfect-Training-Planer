# All-Selected Muscle Filtering Plan

## Goal

Make History and the workout editor apply the same muscle-filter contract: no selection is unrestricted; otherwise
every selected group must occur in the candidate's primary or secondary tags. Other active filters remain conjunctive.

## Scope

- Add one shared pure tag-matching helper and consume it from both client-side filtering paths.
- Make the History membership query require one inner relationship path per selected group, preserving ordered,
  duplicate-free parent membership and the existing separate full-detail query.
- Update muscle-filter wording and focused Node tests. Do not change history pagination or Load More behavior.
- Show each exercise catalogue card's primary and secondary muscle tags as readable pills, independent of whether a
  muscle filter is active.
- Reposition filters into an e-commerce-style left sidebar beside results in both History and the workout editor,
  while retaining a compact, accessible mobile layout.
- Make the History filter header a compact English `Filters` heading with a nearby `Reset filters` action, use
  radio-style date choices in a collapsible Date section, and add a collapsible History equipment facet.
- On mobile, replace the inline-first filter layout with an animated left-side drawer opened from a button above the
  results and closed with a left-arrow control.

## Implementation

1. Create `src/lib/muscle-filter.ts` with the canonical all-selected matcher.
2. Replace the History and catalogue OR checks with that helper; add a date-and-muscle History predicate for contract
   tests.
3. Build aliased History membership embeds dynamically and apply one exact code filter to each alias so PostgREST
   enforces intersection server-side before ordering, cursoring, and limiting.
4. Change both UI fieldset labels to communicate that every selected muscle is required.
5. Cover zero/one/multiple selections, primary/secondary/mixed tags, missing tags, date intersection, duplicate-free
   page merging, and the server membership-query shape; then run the required verification gates.
6. In `src/components/workouts/WorkoutDraftEditor.tsx`, render the existing `exercise.muscles` data beneath each
   catalogue-card heading as compact, non-interactive muscle pills. Reuse the workout-history pill styling so both
   surfaces have one visual language; render them for every displayed card rather than only selected filters or
   search results.
7. Restructure `src/components/workouts/WorkoutDraftEditor.tsx` so search, muscle, and equipment controls form a
   dedicated left filter rail on desktop, beside the catalogue cards. Keep the existing draft panel and all filtering
   state/semantics intact; collapse the rail into the current compact control pattern on small screens.
8. Restructure `src/components/workouts/WorkoutHistory.tsx` so date presets, date inputs, muscle checkboxes, active
   filters, and Clear filters form a dedicated left filter rail beside the history cards on desktop. It should feel
   like a familiar Amazon/Allegro faceted sidebar—grouped controls, clear count/state, and persistent context—without
   changing automatic filtering, history URLs, or infinite-scroll behavior. Preserve a compact stacked mobile layout.
9. Manually verify both surfaces at mobile and desktop widths: filters remain usable, selected states are clear,
   workout draft actions and History loading continue to work, and every unfiltered catalogue card exposes muscle
   pills.
10. Replace the current History header copy with a compact `Filters` heading and adjacent `Reset filters` button.
    Convert preset dates into one accessible radio group (including `All time`) whose selected state is visible like
    the muscle checkboxes, and keep custom start/end dates in a separate collapsible `Date` facet. Selecting a preset
    must retain the existing local-date conversion; entering a custom range must clear the selected preset.
11. Extend the History filter contract, canonical URL/query parsing, service membership query, and tests with a
    validated repeated equipment facet. Selected equipment uses the workout editor's existing any-selected-equipment
    semantics and combines with date and all-selected-muscle constraints using AND. Keep owner isolation, cursor
    ordering, complete unfiltered details, DTO validation, and sanitized failures intact.
12. Replace the current sticky desktop rails with normal-flow desktop sidebars that begin scrolling with the page.
    Do not use a nested vertical scroll container, a viewport-height cap, or a sticky offset that delays the sidebar;
    results and facets must travel together from the top of the document.
13. Add a shared responsive interaction pattern in both filter surfaces: on small screens, show an English `Filters`
    button directly above the results instead of the full filter panel. It opens an animated, left-side off-canvas
    drawer with a backdrop and a labelled left-arrow close button. Changing a filter preserves current automatic
    filtering; the user closes the drawer explicitly to return to the results. Focus, Escape, backdrop click, and
    body-scroll handling must remain accessible and restore focus to the opener on close.
14. Manually verify the supplied reference behaviors: English heading/reset action, collapsible date and muscle
    facets, visible selected date radio, History equipment filtering, desktop document scrolling from the top, and
    mobile drawer opening/closing while filtered results remain correct.

## Progress

- [x] Shared contract and server membership query implemented
- [x] UI wording and tests updated
- [x] Focused tests, Astro sync, lint, build, and implementation review completed
- [x] Exercise-card muscle pills use the History pill treatment
- [x] History date facets, compact English header, and reset action implemented
- [x] History equipment facet works through the validated URL and server membership query
- [x] Desktop sidebars scroll with the document from the top and have no nested scrolling
- [x] Mobile filter drawers open from results and close with the accessible left-arrow control
- [x] Updated desktop and mobile layouts manually verified against the supplied references
