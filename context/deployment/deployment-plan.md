# Cloudflare Workers Deployment Plan

## 1. Summary

1.1. `[x]` Deploy target is Cloudflare Workers, aligned with `context/foundation/infrastructure.md`.

1.2. `[x]` Use Workers/Wrangler commands only: no Cloudflare Pages commands.

1.3. `[x]` Verified locally: `pnpm build` passes and `pnpm exec wrangler deploy --dry-run --outdir .wrangler\deploy-dry-run` succeeds.

1.4. `[!]` Deployment is blocked until lint/CI setup is cleaned up: `pnpm lint` fails on CRLF/Prettier line-ending errors, and GitHub Actions currently uses `npm ci` in a pnpm repo.

## 2. Prerequisites

### 2.1. `[ ]` Phase 0: Local Machine Prerequisites

2.1.1. `[x]` Use Node `22.14.0`, matching `.nvmrc` and `package.json`.

2.1.2. `[x]` Use pnpm `10.24.0`, managed through Corepack from `package.json`.

2.1.3. `[x]` Use the project-local Wrangler dependency through `pnpm exec wrangler`, not a separately installed global Wrangler.

2.1.4. `[ ]` Confirm you can run `pnpm install --frozen-lockfile`, `pnpm lint`, and `pnpm build` from a clean terminal before touching Cloudflare.

2.1.5. `[ ]` Keep `.env`, `.env.production`, `.dev.vars`, and any pasted tokens out of git; `.gitignore` already excludes these files.

### 2.2. `[ ]` Phase 0: Cloudflare Account Prerequisites

2.2.1. `[x]` Create a Cloudflare account and verify the account email.

2.2.2. `[x]` Enable MFA on the Cloudflare account before creating production resources.

2.2.3. `[x]` Confirm Workers is available in the Cloudflare dashboard; no Cloudflare Pages project is needed for this deployment.

2.2.4. `[ ]` Confirm the account has a `workers.dev` subdomain available; first deploy will use this URL instead of a custom domain.

2.2.5. `[ ]` Record the Cloudflare Account ID in a private note or password manager; automation can later read it as `CLOUDFLARE_ACCOUNT_ID`.

2.2.6. `[ ]` For local first deploy, use browser login via `pnpm exec wrangler login`.

2.2.7. `[ ]` For CI later, create a scoped Cloudflare API token and store it only in GitHub Actions secrets as `CLOUDFLARE_API_TOKEN`.

2.2.8. `[ ]` Do not grant DNS, billing, account-admin, or unrelated project permissions unless a later custom-domain task explicitly requires them.

### 2.3. `[ ]` Phase 0: Supabase Account Prerequisites

2.3.1. `[ ]` Create a Supabase account, organization, and hosted project for Perfect Training Planner.

2.3.2. `[ ]` Choose a Supabase region close to the expected users, preferably a European region for the current MVP audience.

2.3.3. `[ ]` Save the Supabase database password in a password manager; do not paste it into this repo or the deployment plan.

2.3.4. `[ ]` In Supabase Dashboard, find the project API URL and low-privilege browser/app key.

2.3.5. `[ ]` Prefer a Supabase `sb_publishable_...` key for `SUPABASE_KEY`; if the starter or dashboard flow still surfaces only the legacy `anon` key, the legacy `anon` key is acceptable for MVP.

2.3.6. `[ ]` Never use a Supabase `service_role` key or `sb_secret_...` key for `SUPABASE_KEY`; those bypass Row Level Security and are not needed for the current auth flow.

2.3.7. `[ ]` Decide email-confirmation behavior for MVP testing: either keep confirmation on and use real inboxes, or temporarily disable it only for private test runs.

2.3.8. `[ ]` After the first Cloudflare deploy gives a URL, set Supabase Auth Site URL to that production URL and add exact production redirect URLs.

2.3.9. `[ ]` Keep localhost redirect URLs for local development, but do not use broad production wildcards.

### 2.4. `[ ]` Phase 0: Beginner Safety Checklist

2.4.1. `[ ]` Store Cloudflare and Supabase credentials in a password manager, not in chat, screenshots, markdown files, or source control.

2.4.2. `[ ]` Keep a private deployment note with: Cloudflare account email, Account ID, Worker name, Supabase project ref, Supabase region, and production URL.

2.4.3. `[ ]` Before production deploy, open both dashboards in separate tabs: Cloudflare Workers logs/deployments and Supabase Auth logs/users.

2.4.4. `[ ]` Treat destructive Supabase actions as manual-only: deleting users, dropping tables, rotating primary secrets, or changing production auth settings.

2.4.5. `[ ]` If any setup step asks for a credit card, paid plan, custom domain, or DNS change, pause and verify whether it is actually required for the MVP.

## 3. Phases And Steps

### 3.1. `[x]` Phase 1: Environment Grounding

3.1.1. `[x]` Confirm Node `22.14.0`, pnpm `10.24.0`, Wrangler `4.95.0`.

3.1.2. `[x]` Confirm Astro uses `output: "server"` and `@astrojs/cloudflare`.

3.1.3. `[x]` Confirm `wrangler.jsonc` points to `@astrojs/cloudflare/entrypoints/server`.

3.1.4. `[x]` Confirm generated Cloudflare bindings from dry run: `ASSETS`, `SESSION` KV, `IMAGES`.

### 3.2. `[ ]` Phase 2: Pre-Deploy Repository Fixes

3.2.1. `[ ]` Add `.gitattributes` to force LF for source/config files.

3.2.2. `[ ]` Normalize tracked source files to LF.

3.2.3. `[ ]` Rerun `pnpm lint` and make it a hard deploy gate.

3.2.4. `[ ]` Update `.github/workflows/ci.yml` to use Corepack/pnpm instead of `npm ci`.

3.2.5. `[ ]` Rename the Worker in `wrangler.jsonc` from `10x-astro-starter` to `perfect-training-planner`.

### 3.3. `[ ]` Phase 3: External Integration Setup

3.3.1. `[ ]` Authenticate Cloudflare locally with `pnpm exec wrangler login`.

3.3.2. `[ ]` For automation later, use `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; keep the token scoped to Workers, not DNS or billing.

3.3.3. `[ ]` Create or select the hosted Supabase project.

3.3.4. `[ ]` Use the Supabase Project URL for `SUPABASE_URL` and a low-privilege publishable or legacy `anon` key for `SUPABASE_KEY`; do not use `service_role` or `sb_secret_...`.

3.3.5. `[ ]` After first deploy, set Supabase Auth Site URL and Redirect URLs to the deployed Workers URL.

3.3.6. `[ ]` Keep BYOK AI provider keys out of Cloudflare secrets; those belong in encrypted per-user Supabase storage when implemented.

### 3.4. `[ ]` Phase 4: Production Deploy

3.4.1. `[ ]` Create untracked `.env.production` with:

```text
SUPABASE_URL=...
SUPABASE_KEY=...
```

3.4.2. `[ ]` Run:

```powershell
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm exec wrangler deploy --dry-run --outdir .wrangler\deploy-dry-run
pnpm exec wrangler deploy --secrets-file .env.production
```

3.4.3. `[ ]` Capture deployed URL, Worker version/deployment ID, and command output summary.

3.4.4. `[ ]` Save the approved audit trail to `context/deployment/deployment-plan.md`.

### 3.5. `[ ]` Phase 5: Production Verification

3.5.1. `[ ]` Run `pnpm exec wrangler deployments status --json`.

3.5.2. `[ ]` Start live logs with `pnpm exec wrangler tail perfect-training-planner`.

3.5.3. `[ ]` Smoke test `/`, `/auth/signin`, `/auth/signup`, and `/dashboard`.

3.5.4. `[ ]` Confirm unauthenticated `/dashboard` redirects to `/auth/signin`.

3.5.5. `[ ]` Test signup, email confirmation behavior, signin, dashboard access, and signout with a disposable Supabase user.

3.5.6. `[ ]` Confirm production no longer shows the missing-Supabase fallback.

## 4. Support And Edge Cases

4.1. `[ ]` If bindings fail, inspect generated `dist/server/wrangler.json`; `SESSION` KV should be adapter-managed.

4.2. `[ ]` If auth redirects to localhost, fix Supabase Auth Site URL/Redirect URLs and retest signup.

4.3. `[ ]` If secrets are missing, redeploy with `pnpm exec wrangler deploy --secrets-file .env.production`.

4.4. `[ ]` If runtime fails under `workerd`, inspect `wrangler tail`, keep `nodejs_compat`, and isolate Node-only dependencies.

4.5. `[ ]` If Cloudflare image costs/errors appear, avoid dynamic transformations for MVP and serve static assets from `public/`.

4.6. `[ ]` If rollback is needed, use `pnpm exec wrangler deployments list --json`, then `pnpm exec wrangler rollback <VERSION_ID>`; handle Supabase data/schema separately.

4.7. `[ ]` If Wrangler opens a browser but login does not complete, rerun `pnpm exec wrangler login` from a fresh terminal and verify with `pnpm exec wrangler whoami`.

4.8. `[ ]` If Cloudflare asks about Pages during setup, stop and return to the Worker route; this repo is configured for Workers, not Pages.

4.9. `[ ]` If Supabase signup emails do not arrive, check Supabase Auth logs first, then email confirmation settings, then spam/quarantine folders.

4.10. `[ ]` If Supabase returns authorization or empty-data surprises later, check Row Level Security policies before changing keys.

## 5. Assumptions

5.1. First production deploy uses the default `workers.dev` URL.

5.2. Custom domain and CI auto-deploy are deferred until the manual CLI deploy is stable.

5.3. No Cloudflare Pages commands are used.

5.4. Current reference docs: [Cloudflare Workers CLI getting started](https://developers.cloudflare.com/workers/get-started/guide/), [Wrangler system environment variables](https://developers.cloudflare.com/workers/wrangler/system-environment-variables/), [Workers commands](https://developers.cloudflare.com/workers/wrangler/commands/workers/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Astro on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/), [Supabase API keys](https://supabase.com/docs/guides/api/api-keys/), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), and [Cloudflare Images pricing](https://developers.cloudflare.com/images/pricing/).
