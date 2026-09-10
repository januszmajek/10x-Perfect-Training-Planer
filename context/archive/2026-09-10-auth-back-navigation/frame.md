# Frame Brief: Auth-page Back Navigation

> Framing step before `/10x-plan`. This document separates the observed symptom
> from assumptions about its cause.

## Reported Observation

After a successful sign-in reaches Dashboard, browser Back returns to `/auth/signin` and displays the sign-in card even though the user is authenticated.

## Initial Framing (preserved)

- **User's stated cause or approach**: No cause was assumed.
- **User's proposed direction**: Find the most technically sound and user-friendly resolution.
- **Pre-dispatch narrowing**: This is one specific, repeatable sign-in history symptom.

## Dimension Map

The observation could originate at any of these dimensions:

1. **Post-login history semantics** — the successful form submission redirects to Dashboard but leaves the preceding sign-in document in Back history.
2. **Public-auth authorization boundary** — an authenticated request to `/auth/signin` is allowed to render the form. ← initial investigation focus
3. **BFCache restoration** — Back restores the pre-login sign-in document without issuing a request, so SSR authorization cannot run.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| Post-login history is wrong by itself | The sign-in endpoint correctly makes a `303` redirect to Dashboard; keeping the prior document in history is normal browser behavior. `src/pages/api/auth/signin.ts:13-19` | NONE |
| Authenticated public-auth requests are not redirected | Middleware resolves `locals.user`, but protects only unauthenticated private routes. The sign-in page always renders the card. `src/middleware.ts:14-33`; `src/pages/auth/signin.astro:5-20` | STRONG |
| BFCache restores a stale public-auth document | Only the authenticated layout handles persisted `pageshow`; sign-in uses the base layout. `src/layouts/AuthenticatedLayout.astro:89-93`; `src/pages/auth/signin.astro:2,8`; `src/layouts/Layout.astro:13-40` | STRONG |

## Narrowing Signals

- The symptom occurs after one specific sequence: successful sign-in, Dashboard, then browser Back.
- The previous navigation change deliberately covered only private pages and explicitly excluded public auth-page behavior. `context/changes/navigation/plan-brief.md:33-36,49`

## Cross-System Convention

Session-dependent public-auth routes should not render credential forms to an already authenticated user. Browser lifecycle restoration must also re-enter that authorization boundary when a cached document could bypass an SSR request.

## Reframed Problem Statement

> **The actual problem to plan around is**: Auth-only pages lack an authenticated-user boundary and BFCache revalidation, allowing a stale pre-login document to be displayed after a session is established.

This is not a defect in the successful login redirect, nor should it be solved by removing normal Back history. The resolution must make both a fresh request and a cached restoration converge on the authenticated experience.

## Confidence

- **HIGH** — the route, middleware, and lifecycle gaps are independently evidenced and match the reported sequence.

## What Changes for `/10x-plan`

Plan an auth-page session boundary that covers both server-rendered requests and restored browser documents. Keep normal browser history intact and verify the post-login Back path in a real browser.

## References

- Source files: `src/pages/auth/signin.astro:5-20`, `src/pages/api/auth/signin.ts:13-19`, `src/middleware.ts:14-33`, `src/layouts/AuthenticatedLayout.astro:89-93`
- Related change: `context/changes/navigation/plan-brief.md:33-36,49`
- Investigation tasks: `/root/auth_route_trace`, `/root/cache_behavior`
