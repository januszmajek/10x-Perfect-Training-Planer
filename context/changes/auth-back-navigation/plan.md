# Auth-page Back Navigation Implementation Plan

## Overview

Prevent an authenticated user from seeing stale sign-in or sign-up forms after browser Back navigation. The change adds a server-side boundary for credential-entry routes and revalidates those routes after a BFCache restoration.

## Current State Analysis

The sign-in endpoint correctly creates a session and returns a `303` redirect to Dashboard, but the old sign-in document remains a normal browser-history entry. Middleware resolves `context.locals.user` for every request but only redirects unauthenticated visitors away from protected routes. Both credential-entry pages always render their forms. Meanwhile, only the private authenticated layout reloads a document restored from BFCache.

## Desired End State

An authenticated request for `/auth/signin` or `/auth/signup` resolves to Dashboard without displaying a credential form. When Back restores either credential-entry page from BFCache, it re-enters the server boundary: authenticated users land on Dashboard, while users who have signed out see the normal form. Normal browser history remains intact.

### Key Discoveries:

- Session resolution is already centralized in `src/middleware.ts:14-25`.
- The post-login redirect is already a correct `303` in `src/pages/api/auth/signin.ts:13-19`.
- `src/layouts/AuthenticatedLayout.astro:89-93` establishes the project's `pageshow.persisted` refresh pattern.
- `src/pages/auth/signin.astro` and `src/pages/auth/signup.astro` share the base layout but have no authenticated-user or BFCache handling.

## What We're NOT Doing

- Removing or rewriting normal browser Back history after form submission.
- Redirecting the email-confirmation route.
- Adding client-side Supabase session lookups, new database fields, or API endpoints.
- Disabling browser caching globally or adding new test infrastructure.

## Implementation Approach

Make the server middleware responsible for the current-session decision on credential-entry routes, then give those routes a small shared layout boundary that reloads only a BFCache-restored document. This keeps authorization authoritative on the server and makes cached and non-cached navigation agree.

## Critical Implementation Details

The BFCache handler must run only when `event.persisted` is true. Reloading every `pageshow` would create an unnecessary loop, while a direct client redirect would be wrong after a user has subsequently signed out.

## Phase 1: Establish the Auth-only Server Boundary

### Overview

Route authenticated users away from credential-entry pages before the form can render.

### Changes Required:

#### 1. Middleware routing rules

**File**: `src/middleware.ts`

**Intent**: Identify the sign-in and sign-up routes as credential-entry routes and redirect an already authenticated user to Dashboard. Preserve the existing unauthenticated protection of private routes.

**Contract**: `/auth/signin` and `/auth/signup` must render only for `context.locals.user === null`; an authenticated request receives a redirect to `/dashboard`. `/auth/confirm-email` remains public.

### Success Criteria:

#### Automated Verification:

- Type-aware lint succeeds: `pnpm lint`
- Production SSR build succeeds: `pnpm build`

#### Manual Verification:

- A signed-in visitor directly opening `/auth/signin` reaches Dashboard without seeing the form.
- A signed-in visitor directly opening `/auth/signup` reaches Dashboard, while a signed-out visitor can still view both forms.

**Implementation Note**: Complete the automated checks and the focused route checks before moving to BFCache handling.

---

## Phase 2: Revalidate Restored Credential-entry Pages

### Overview

Ensure browser Back/Forward restoration cannot display a frozen pre-login form after the session changes.

### Changes Required:

#### 1. Shared credential-entry layout

**File**: `src/layouts/AuthEntryLayout.astro` (new)

**Intent**: Provide a shared shell for sign-in and sign-up pages which delegates normal markup to `Layout` and refreshes only when restored from BFCache.

**Contract**: The layout accepts the existing `title` prop and renders its slot unchanged. Its `pageshow` listener invokes a reload only when `event.persisted` is true.

#### 2. Credential-entry route adoption

**Files**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`

**Intent**: Use the shared credential-entry layout so both routes have the same session and BFCache behavior.

**Contract**: Existing headings, forms, error-query behavior, and cross-links remain unchanged; only their shared layout wrapper changes.

### Success Criteria:

#### Automated Verification:

- Type-aware lint succeeds: `pnpm lint`
- Production SSR build succeeds: `pnpm build`

#### Manual Verification:

- Sign in, reach Dashboard, then use browser Back; the result is Dashboard rather than the stale sign-in card.
- Sign out, then return to a previously visited credential-entry page with Back/Forward; the sign-in form is available rather than an authenticated redirect loop.
- Repeat the Back restoration from the sign-up route and confirm an authenticated user ends at Dashboard.

**Implementation Note**: Verify in a real browser because BFCache behavior is browser lifecycle behavior and does not have a configured automated test runner.

## Testing Strategy

### Automated Checks

- Run `pnpm lint` and `pnpm build` after each phase.
- Do not add a test runner for this focused lifecycle change.

### Manual Testing Steps

1. Signed out: open `/auth/signin` and `/auth/signup`; both forms must render.
2. Sign in successfully, land on Dashboard, and use browser Back; Dashboard must remain the visible destination.
3. Sign out, return through Back/Forward to an auth-entry page, and confirm the appropriate form is shown.
4. Repeat the authenticated Back case from `/auth/signup`.

## Performance Considerations

The refresh occurs only for BFCache restores of two public credential-entry routes. Normal navigation and protected pages retain their existing behavior.

## Migration Notes

No database or deployment migration is required. Roll back by removing the auth-route redirect and shared credential-entry BFCache boundary together.

## References

- Frame: `context/changes/auth-back-navigation/frame.md`
- Server auth client: `src/lib/supabase.ts:1-22`
- Existing BFCache pattern: `src/layouts/AuthenticatedLayout.astro:89-93`
- Prior scope boundary: `context/changes/navigation/plan-brief.md:33-36,49`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Establish the Auth-only Server Boundary

#### Automated

- [x] 1.1 Type-aware lint succeeds: `pnpm lint`
- [x] 1.2 Production SSR build succeeds: `pnpm build`

#### Manual

- [x] 1.3 Signed-in direct visits to credential-entry routes redirect to Dashboard
- [x] 1.4 Signed-out direct visits to credential-entry routes render their forms

### Phase 2: Revalidate Restored Credential-entry Pages

#### Automated

- [ ] 2.1 Type-aware lint succeeds: `pnpm lint`
- [ ] 2.2 Production SSR build succeeds: `pnpm build`

#### Manual

- [ ] 2.3 Sign-in, Dashboard, and browser Back never show a stale sign-in card
- [ ] 2.4 Signed-out Back/Forward restoration renders a credential-entry form
- [ ] 2.5 Sign-up Back restoration redirects an authenticated user to Dashboard
