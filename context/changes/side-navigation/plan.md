# Responsive Sidebar, Account, and Signup Implementation Plan

## Overview

Replace the private workspace header with one responsive navigation system: a full desktop sidebar, an icon-only desktop rail when space is constrained or the Workout builder is active, and the existing mobile drawer below `sm`. The change also removes email confirmation, moves sign-out to the Account page, resets existing local and hosted users through an explicit operational procedure, and makes OpenRouter key saving live-validated without retaining or exposing any key characters.

## Current State Analysis

Every authenticated page is wrapped by `AuthenticatedLayout`, which currently renders a horizontal desktop header with Dashboard, Workout, History, Account, and Sign out. Its `pageshow.persisted` handler is a load-bearing BFCache boundary and must remain intact. `MobileNavigation` already owns the drawer portal, overlay dismissal, Escape handling, initial focus, focus return, and body-scroll locking; it currently repeats the navigation links and places Sign out at the bottom.

The current sign-up endpoint calls Supabase `signUp` but ignores the returned session and always routes to a public confirmation page. Local Supabase already has email confirmations disabled. There is no confirmation callback route.

The encrypted-key schema and UI still retain `key_prefix`/`key_hint`, returning and rendering first/last plaintext characters. The shared format validator only accepts printable ASCII after trimming input, and saving never calls OpenRouter. These contracts conflict with the new requirements: no stored/displayed key material and live validation before persistence.

## Desired End State

- At `sm` and above, private pages show a persistent left navigation. Non-Workout routes use a 16rem full sidebar at `xl` and above; they use a compact icon rail from `sm` through `xl`. Workout create/edit routes always use the compact rail on desktop to protect builder space. Mobile never renders either desktop variant.
- The full sidebar has Dashboard, Workout, and History links plus a bottom Account link composed of a generic avatar and the text “Account”. The compact rail provides the same destinations as icons with hover/focus tooltips. All links expose their active state with `aria-current="page"`. Account always links to `/account`; no account menu or sidebar/drawer sign-out action remains.
- The existing drawer remains the sole mobile navigation implementation. Its footer becomes an Account link at the bottom, while all overlay, Escape, focus, and scroll-lock behavior remains unchanged.
- Auto-confirmed email/password signup establishes the Supabase session and redirects to `/dashboard?status=account-created`. Dashboard shows one account-created toast. Email confirmation, its page, and its documentation are removed; a no-session response becomes a safe sign-up error rather than an alternate confirmation journey.
- Before a supplied OpenRouter key is encrypted or saved, the Worker calls OpenRouter's authenticated current-key endpoint. Only a successful response permits persistence. Invalid, timeout, rate-limit, network, or provider failures preserve the existing key and return generic browser-safe feedback. No saved key character or provider response body is returned, logged, or rendered.
- The forward migration removes all plaintext-derived key metadata. Account can expose only configured/not-configured state and update time. Existing local and hosted Auth users—and the application data that cascades from them—are deliberately wiped through an operator-approved procedure.

### Key Discoveries:

- `src/layouts/AuthenticatedLayout.astro:16-28` owns the current navigation array and active Workout route rule; `:33-93` owns the private header and BFCache reload.
- `src/components/MobileNavigation.tsx:36-56` already implements drawer Escape, focus return, and scroll locking; it must be extended rather than replaced.
- `src/pages/api/auth/signup.ts:13-19` discards `signUp` session data and unconditionally routes to `/auth/confirm-email`.
- `supabase/config.toml:202-209` already sets local email confirmations to false; hosted Auth settings remain operator-owned configuration.
- `supabase/migrations/20260827130000_create_ai_provider_keys.sql:8,24,76-79` and `20260905230000_add_ai_provider_key_prefix.sql:1-9` created the key-derived metadata that must be removed.
- `src/lib/ai-provider-keys.ts:43-100,146-155` reads/writes fragments, while `src/components/account/AiKeyForm.tsx:86-100` renders them and places them in an ARIA label.
- User-owned keys and workouts use `ON DELETE CASCADE` from `auth.users`; hard deletion invalidates refresh sessions, although already-issued JWTs remain valid until expiry.

## What We're NOT Doing

- Creating a second mobile drawer, client-side router, sidebar-collapse preference, search, shortcuts, extra settings categories, copied reference content, donation prompts, or branding.
- Displaying the signed-in email anywhere in sidebar/drawer navigation, revealing any saved API-key fragment, or parsing/logging the OpenRouter current-key response body.
- Sending an account-created email, supporting email-confirmation callbacks, or preserving a confirmation-pending state.
- Adding tests, browser/E2E tooling, or manual-test work. Existing test assertions are changed or removed only where they directly assert removed prefix/hint columns or confirmation behavior.
- Embedding a service-role key in application code, repository configuration, shell history, or documentation; privileged hosted-user deletion remains a dashboard/operator action.
- Using `supabase db reset --linked`, deleting an ambiguous remote project, or modifying production data without confirmed target and permanent-loss acknowledgement.

## Implementation Approach

Keep navigation topology server-rendered in `AuthenticatedLayout`: it already knows the authenticated user and current pathname. Add reusable route metadata with labels/icons, render one full desktop sidebar plus one CSS-selectable compact rail, and retain the current mobile header/drawer boundary. CSS breakpoints select the full sidebar only for non-Workout `xl`+ documents; pathname-derived classes force Workout routes to the compact desktop rail. The rail uses native links, visually hidden text, and hover/focus tooltips so no JavaScript state is needed.

Live key validation belongs on the server next to encryption. Retire client prefix/character validation and retain only bounded form parsing before a `GET https://openrouter.ai/api/v1/key` Bearer request. Discard all successful and failed provider bodies. Encrypt and upsert only after a successful response, preserving validate/prepare-before-write ordering so a rejected key or operational error cannot replace an existing encrypted credential.

The user wipe is an operational phase, not an application endpoint. Use a local-only database reset to clear local Auth/application rows. For the confirmed hosted Supabase project, an authorized operator hard-deletes all Auth users through the Supabase dashboard or privileged Admin API, after backup/project verification and after removing any Storage-owned objects if present. Existing foreign-key cascades remove corresponding application rows; never add the privileged credential to this app.

## Critical Implementation Details

The icon rail is desktop-only presentation, not a replacement for the mobile drawer: it must be hidden below `sm` even if the viewport is narrow. Preserve the `pageshow.persisted` listener in the private layout; it guarantees a BFCache-restored drawer or rail is rebuilt from fresh authentication/page state.

OpenRouter's current-key response can contain a masked label. Treat the response as a status-only signal: do not deserialize, relay, or log it. Apply timeout/failure mapping before encryption/upsert, and represent all provider operational failures with a generic retry status.

## Phase 1: Remove Confirmation and Secret-Derived Persistence

### Overview

Make auto-confirmation the only supported email/password signup mode and remove persisted key fragments before any new account/key flow relies on the revised contracts.

### Changes Required:

#### 1. Auth configuration and route documentation

**Files**: `supabase/config.toml`, `README.md`, `src/pages/auth/confirm-email.astro`

**Intent**: Keep local email confirmation explicitly disabled, remove the obsolete confirmation route, and document immediate-session signup behavior. Make the hosted confirmation setting an explicit deployment prerequisite, not repository-controlled secret/configuration.

**Contract**: `/auth/confirm-email` no longer exists or appears in the route table. Hosted Supabase Email Confirmations must be disabled before release; the project sends no replacement email.

#### 2. Forward credential-metadata migration and generated types

**Files**: `supabase/migrations/<timestamp>_remove_ai_provider_key_metadata.sql` (new), `src/types/database.types.ts`, `supabase/tests/database/ai_provider_keys.test.sql`

**Intent**: Permanently remove `key_prefix` and `key_hint` plus their check constraints and authenticated-column grants. Align generated database types and remove or revise only database assertions that reference deleted columns/constraints.

**Contract**: `public.ai_provider_keys` retains only owner, provider, ciphertext, IV, encryption version, and timestamps. No database API role has a column containing a plaintext-derived key fragment.

#### 3. Explicit local and hosted user reset runbook

**File**: `README.md`

**Intent**: Record the requested destructive reset as an auditable, environment-separated operation. This prevents a linked reset or unverified dashboard selection from erasing the wrong project.

**Contract**: The runbook requires backup/project-ref confirmation; local reset using the local-only workflow; hosted Auth-user hard deletion through a privileged dashboard/Admin operation; Storage ownership cleanup if needed; and no service-role credential in application configuration. It states that cascade deletes clean application data and that already-issued JWTs persist until expiry.

### Success Criteria:

#### Automated Verification:

- Repository lint succeeds: `pnpm lint`
- Production SSR build succeeds: `pnpm build`

---

## Phase 2: Auto-Session Signup and Validated Key Lifecycle

### Overview

Redirect only successfully session-established registrations to Dashboard and validate each API key with OpenRouter before encryption or persistence, without introducing client-visible secret metadata.

### Changes Required:

#### 1. Signup response and dashboard creation status

**Files**: `src/pages/api/auth/signup.ts`, `src/pages/dashboard.astro`, `src/components/auth/SignUpForm.tsx`

**Intent**: Branch on the session returned by `signUp`, preserve current client validation/Supabase-error rendering, and give successfully registered users the requested Dashboard toast.

**Contract**: A non-null returned session produces a 303 redirect to `/dashboard?status=account-created`. A provider error remains a sign-up-page error. A null session is an Auth configuration failure that safely returns to sign-up with a browser-safe error; it never routes to confirmation/sign-in. Dashboard recognizes only the supported status and renders a one-time account-created status message.

#### 2. Status-only OpenRouter credential validator

**Files**: `src/lib/ai-provider-key-validation.ts`, `src/lib/openrouter-client.ts`, `src/lib/ai-provider-keys.ts`, `src/pages/api/account/ai-key.ts`, `src/components/account/AiKeyForm.tsx`

**Intent**: Replace prefix/character-based acceptance with a server-only OpenRouter current-key request before encryption. Bound the submitted form value for resource safety, but do not expose a client-side key-format verdict.

**Contract**: `ai-provider-key-validation.ts` is server-only: it is not imported by hydrated React code. `AiKeyForm` performs only bounded raw-input handling and submits to the same-origin API; it receives no client-side provider or key-format verdict. The server sends the submitted key only as Authorization Bearer credentials to OpenRouter's current-key endpoint and inspects only the HTTP outcome. A success permits encryption/upsert; 401/403 maps to a generic rejected-key status; timeout, 429, network, malformed, and 5xx outcomes map to a generic retry status. No provider body, request key, key-derived label, or technical error is parsed into output/logs. Failed validation does not mutate an existing database row.

#### 3. Metadata-free account UI and account sign-out

**Files**: `src/pages/account.astro`, `src/components/account/AiKeyForm.tsx`, `src/pages/api/account/ai-key/remove.ts`

**Intent**: Make Account display only configured state and update time, maintain encrypted remove behavior, and make it the single desktop/mobile location for sign-out.

**Contract**: `MaskedAiProviderKey` (or replacement) carries no prefix/hint property. No part of saved plaintext appears in markup, labels, props, URL parameters, response text, or ARIA. The Account page has one visible descriptive `h1` and contains the existing same-origin Sign out POST form; remove flow remains explicit and secure.

### Success Criteria:

#### Automated Verification:

- Repository lint succeeds: `pnpm lint`
- Production SSR build succeeds: `pnpm build`

**Implementation Note**: Do not add a provider request to the browser. The server must complete live validation before encryption/upsert so transient OpenRouter failure cannot overwrite a previously working key.

---

## Phase 3: Responsive Sidebar and Drawer Adaptation

### Overview

Replace private horizontal navigation with one information architecture expressed as a full sidebar, compact icon rail, or existing mobile drawer, without changing page content semantics or private-route behavior.

### Changes Required:

#### 1. Shared private navigation metadata and desktop shell

**Files**: `src/layouts/AuthenticatedLayout.astro`, `src/components/SidebarNavigation.tsx` (new, if extraction keeps the shell readable)

**Intent**: Replace the header/navigation/sign-out block with full and compact desktop sidebar variants. Keep main content beside persistent navigation and retain private BFCache revalidation.

**Contract**: Primary navigation contains only Dashboard (`/dashboard`), Workout (`/workouts/new`, active for `/workouts/edit`), and History (`/history`). Full desktop navigation is 16rem and visible only for non-Workout `xl`+ documents. Compact navigation is visible for Workout `sm`+ documents and non-Workout `sm`–`xl` documents. No desktop navigation renders below `sm`; `aria-current="page"` and active-path behavior remain correct.

#### 2. Icon rail, tooltips, and Account link

**Files**: `src/layouts/AuthenticatedLayout.astro`, `src/components/SidebarNavigation.tsx` (if created)

**Intent**: Add the requested generic avatar treatment and discoverable icon-only rail using the established palette, typography, focus styling, and available Lucide icons.

**Contract**: The full footer is pinned with flex layout and exposes a generic avatar plus “Account”, both inside one anchor to `/account`. The compact footer is an avatar-only `/account` link. Navigation icons have accessible link names, are `aria-hidden` themselves, show their label in a hover/focus tooltip, and keep active visual state without an account menu or email value. The sidebar never adds a visible `h1`.

#### 3. Existing mobile drawer footer

**File**: `src/components/MobileNavigation.tsx`

**Intent**: Adapt the existing drawer's shared item input and bottom area to use the same three primary links and a bottom Account link, without duplicating its dialog lifecycle.

**Contract**: Below `sm`, the drawer remains the only navigation UI. Its overlay, `inert` state, body scroll lock, Escape close, initial link focus, outside close, and return-focus behavior are unchanged. Its `mt-auto` footer links to `/account` with generic avatar/Account label; it contains no email, Account menu, or Sign out form.

#### 4. Private page heading and route preservation

**Files**: `src/pages/dashboard.astro`, `src/pages/history.astro`, `src/pages/workouts/new.astro`, `src/pages/workouts/edit.astro`, `src/pages/account.astro`, `src/middleware.ts`

**Intent**: Preserve each page's current descriptive single main-content heading while checking that sidebar changes do not alter protected-route or Workout active-state behavior.

**Contract**: Dashboard remains “Dashboard”; Workout pages retain “Workout builder”/“Edit your workout”; History retains “Workout history”; Account retains its dedicated key-settings heading. No route gains a second visible `h1`, and `PROTECTED_ROUTES` continues to authorize the same private surfaces.

### Success Criteria:

#### Automated Verification:

- Repository lint succeeds: `pnpm lint`
- Production SSR build succeeds: `pnpm build`

**Implementation Note**: Keep route selection in the server-rendered layout rather than a client router. The compact rail's responsive rule is presentation-only and must not create browser-history or persisted sidebar state.

---

## Phase 4: Configuration and Handoff Cleanup

### Overview

Finish the change by removing stale confirmation/key-metadata references and running only the agreed repository gates.

### Changes Required:

#### 1. Remove obsolete references and stale assertions

**Files**: Repository files identified by a final `rg` search for `confirm-email`, `key_prefix`, and `key_hint`, including `README.md`, generated types, and the existing AI-key database test.

**Intent**: Ensure source, documentation, and existing assertions agree with the shipped security/auth contracts without adding new test coverage.

**Contract**: No production source or user-facing documentation references a confirmation journey or retained API-key fragment. Existing assertions unrelated to removed behavior remain intact; only assertions whose subject was deleted are retired or updated.

#### 2. Build-gate evidence

**Files**: No source-file change expected.

**Intent**: Run the exact verification scope the user chose and record any failures for correction before handoff.

**Contract**: Run `pnpm lint` and `pnpm build` only. Do not add or execute a new test suite, database test command, provider validation script, or manual browser matrix for this change.

### Success Criteria:

#### Automated Verification:

- Source/documentation search finds no stale confirmation or key-fragment production references.
- Repository lint succeeds: `pnpm lint`
- Production SSR build succeeds: `pnpm build`

#### Manual Verification:

- No manual test is planned; the sole manual requirement is an operator release gate: after confirmed-project review, apply the hosted migration through the documented dry-run/`db push` workflow, then hard-delete all hosted Auth users.

**Implementation Note**: This release gate is not a browser or provider test. It runs only after every implementation phase is complete, the remote project is confirmed, and permanent-loss acknowledgement is obtained.

## Testing Strategy

No new tests are added and no manual test matrix is executed by user decision. Phase 4's one manual item is a destructive operator release gate, not a test. The only existing test changes are removal or adaptation of assertions that directly name removed confirmation behavior or `key_prefix`/`key_hint`. Repository gates remain `pnpm lint` and `pnpm build` as required by project policy.

## Performance Considerations

The persistent full sidebar consumes 16rem only when a non-Workout document is `xl` or wider; all Workout desktop views use the compact rail to preserve builder width. The responsive switch is CSS/path presentation, with no client route transition, storage, or new data request.

The key-validation request adds one bounded server-to-provider round trip only when a user saves/replaces a key. It is deliberately fail-closed; no request body or response body is retained after the decision.

## Migration Notes

The migration is forward-only and destructive for prefix/hint metadata: it drops columns and associated constraints/grants, leaving ciphertext intact until the requested user reset cascades it away. Apply hosted migrations only through the existing dry-run/confirmed `db push` workflow—never `db reset --linked`.

The user reset is separately destructive. Local reset clears local Auth/application data. Hosted hard deletion must target the verified project only, account for Storage-owned objects, and invalidate refresh sessions; an already issued stateless JWT can remain accepted until its configured expiry. No remote deletion occurs as part of plan creation.

## References

- Planning screenshots (Git-ignored): `context/changes/side-navigation/references/sidebar-narrow-reference.png`, `sidebar-mobile-reference.png`, `sidebar-desktop-reference.png`, and `sidebar-compact-rail-reference.png`
- Navigation shell and BFCache boundary: `src/layouts/AuthenticatedLayout.astro:16-28,33-93`
- Existing drawer lifecycle: `src/components/MobileNavigation.tsx:22-56,100-155`
- Signup route: `src/pages/api/auth/signup.ts:4-19`; local email configuration: `supabase/config.toml:202-209`
- Key metadata persistence: `supabase/migrations/20260827130000_create_ai_provider_keys.sql:3-25`, `supabase/migrations/20260905230000_add_ai_provider_key_prefix.sql:1-9`
- Current key exposure: `src/lib/ai-provider-keys.ts:43-100,146-155`; `src/components/account/AiKeyForm.tsx:86-100`
- OpenRouter current-key endpoint: [OpenRouter API documentation](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key)
- Auth-user hard deletion/cascade guidance: [Supabase managing user data](https://supabase.com/docs/guides/auth/managing-user-data)
- Prior private navigation/BFCache contracts: `context/archive/2026-08-27-private-account-and-ai-key/plan.md`, `context/archive/2026-09-10-navigation/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Remove Confirmation and Secret-Derived Persistence

#### Automated

- [x] 1.1 Remove confirmation route/docs and align hosted-auth configuration guidance
- [x] 1.2 Drop key-prefix/key-hint metadata and align generated types/stale assertions
- [x] 1.3 Document the approved local and hosted Auth-user reset procedure
- [x] 1.4 Repository lint succeeds: `pnpm lint`
- [x] 1.5 Production SSR build succeeds: `pnpm build`

### Phase 2: Auto-Session Signup and Validated Key Lifecycle

#### Automated

- [ ] 2.1 Redirect session-established signups to Dashboard with the creation status
- [ ] 2.2 Validate keys server-side with OpenRouter before encryption/upsert
- [ ] 2.3 Remove saved-key fragments from account data, UI, and ARIA; add Account-page sign-out
- [ ] 2.4 Repository lint succeeds: `pnpm lint`
- [ ] 2.5 Production SSR build succeeds: `pnpm build`

### Phase 3: Responsive Sidebar and Drawer Adaptation

#### Automated

- [ ] 3.1 Replace private desktop header with full-sidebar and compact-rail variants
- [ ] 3.2 Add generic Account links, accessible icon labels/tooltips, and active-state semantics
- [ ] 3.3 Adapt the existing mobile drawer footer without changing its lifecycle behavior
- [ ] 3.4 Preserve descriptive page headings and protected-route behavior
- [ ] 3.5 Repository lint succeeds: `pnpm lint`
- [ ] 3.6 Production SSR build succeeds: `pnpm build`

### Phase 4: Configuration and Handoff Cleanup

#### Automated

- [ ] 4.1 Remove remaining stale confirmation/key-fragment references and assertions
- [ ] 4.2 Repository lint succeeds: `pnpm lint`
- [ ] 4.3 Production SSR build succeeds: `pnpm build`

#### Manual

- [ ] 4.4 No manual test is planned; the sole manual requirement is an operator release gate: after confirmed-project review, apply the hosted migration through the documented dry-run/`db push` workflow, then hard-delete all hosted Auth users.
