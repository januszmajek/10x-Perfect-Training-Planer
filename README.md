# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- Corepack (comes with Node.js)
- pnpm v10 (managed by Corepack from `package.json`)
- Docker with approximately 7 GB of memory available for the local Supabase stack

Use the same dependency flow on Windows and Linux/Omarchy. Install the Node.js version from `.nvmrc`, then enable Corepack once per machine or Node.js installation:

```bash
corepack enable
corepack prepare pnpm@10.24.0 --activate
pnpm -v
```

After that, normal project work only needs `pnpm install`, `pnpm dev`, and the other scripts below. Run `pnpm install` separately on each OS. Do not copy or share `node_modules` between Windows and Linux because several dependencies install OS-specific binaries.

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

```bash
pnpm dev
```

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication, the exercise catalogue, and private workout
storage. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only
secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

The committed `supabase/config.toml` and migrations are sufficient; do not run `supabase init`.

1. Start the local stack. The first run downloads its Docker images:

```bash
pnpm exec supabase start
```

2. Rebuild the database from the committed migrations and local seed entry point:

```bash
pnpm exec supabase db reset --local
```

The ordered migrations create the production exercise catalogue and private workout lifecycle. `supabase/seed.sql`
is reserved for non-sensitive local-only fixtures; production catalogue records belong in versioned migrations and
must not be duplicated there.

3. Create `.env` and `.dev.vars` locally, then add the URL and publishable or anon key printed by
   `pnpm exec supabase status`:

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<local publishable or anon key>
AI_KEY_ENCRYPTION_KEY_V1=<unpadded-base64url-encoding-of-32-random-bytes>
OPENROUTER_MODEL=<fixed-openrouter-model-with-strict-structured-output-support>
AI_CONFIRMATION_SIGNING_SECRET=<independent-random-secret>
```

Never use a `service_role` or `sb_secret_...` key in the application. Both local environment files are ignored by
git.

`AI_KEY_ENCRYPTION_KEY_V1` is optional for builds and read-only pages, but AI-key save and replacement operations
fail closed when it is missing or malformed. Its value must be the unpadded base64url encoding of exactly 32 random
bytes. To generate it directly into the ignored `.dev.vars` file without printing it, run this once:

```bash
node -e 'const { randomBytes } = require("node:crypto"); const { appendFileSync } = require("node:fs"); appendFileSync(".dev.vars", `\nAI_KEY_ENCRYPTION_KEY_V1=${randomBytes(32).toString("base64url")}\n`, { mode: 0o600 })'
```

Use only placeholder text in committed examples. Never print, log, or commit the generated value. Losing the V1
secret makes existing encrypted provider keys unrecoverable, so production backup and future rotation require an
explicit operational procedure.

`OPENROUTER_MODEL` is a server-only fixed model identifier used only by the AI workout-generation route. Pick an
OpenRouter model that supports strict structured JSON output; users cannot provide or override it from the browser.
The model setting is not an OpenRouter API key. Each user supplies their own disposable or personal OpenRouter key in
the Account page. Before encryption or storage, the Worker sends that key through one fixed-model completion limited to
one output token and discards the response body. This validates the capability the app actually needs and can consume a
small amount of the user's OpenRouter credit. An unsuccessful validation never replaces an existing encrypted key.

`AI_CONFIRMATION_SIGNING_SECRET` is a separate Worker-only HMAC secret used to sign the short-lived, owner-bound
confirmation required for a reduced three- or four-exercise history-aware proposal. It must be unrelated to
`AI_KEY_ENCRYPTION_KEY_V1`, OpenRouter keys, and Supabase credentials. Generate and store a high-entropy value without
printing it, for example with the same ignored-file pattern used for the encryption root. Rotating this secret
invalidates outstanding reduced-generation confirmations; users can safely start generation again, and a stored nonce
cannot authorize a request without a valid signature.

4. Verify the database contract:

```bash
pnpm exec supabase db lint --local --schema public --fail-on error
pnpm exec supabase test db --local supabase/tests/database
bash supabase/tests/database/workout_lifecycle_concurrency.test.sh
```

5. Regenerate and normalize TypeScript database types after any schema change:

```bash
pnpm exec supabase gen types typescript --local --schema public > src/types/database.types.ts
pnpm exec prettier --config .prettierrc.json --write src/types/database.types.ts
```

Commit the regenerated file. CI repeats this pipeline and fails if the committed types drift from a clean local
schema.

### AI recommendation retention job

The migration-managed `purge-expired-ai-recommendation-data` job runs daily and removes only expired proposal/event
telemetry, independent post-save completion telemetry, plus expired or consumed reduced-generation confirmations.
Verify its installation and recent status with:

```sql
select schedule, jobname, command from cron.job where jobname = 'purge-expired-ai-recommendation-data';
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'purge-expired-ai-recommendation-data')
order by start_time desc limit 10;
```

For a deliberate rollback/replacement, use a reviewed forward migration containing
`select cron.unschedule('purge-expired-ai-recommendation-data');`; do not disable retention merely because application
code is rolled back. The job does not remove durable explicit preferences or workout history. Saved history-aware
workouts retain only an opaque proposal-lineage UUID, so deleting the raw proposal cannot prevent a later completion
event from being recorded with its own 90-day expiry.

History-aware save and completion support is additive. An application rollback may continue calling the legacy
`save_ai_planned_workout` RPC; do not drop the distinct history-aware RPC, opaque workout lineage column, completion
telemetry table, or cleanup behavior until a reviewed forward migration proves no active client depends on them.

6. Start the application or stop the database stack when finished:

```bash
pnpm dev
pnpm exec supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Hosted Supabase configuration

Using a hosted project is optional for ordinary development. Its application configuration uses the same variables:

| Variable       | Description                                                               |
| -------------- | ------------------------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API                      |
| `SUPABASE_KEY` | Publishable or legacy `anon` key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<publishable-or-anon-key>
```

Applying migrations to a hosted database is a separate operational action. A human must first review
`pnpm exec supabase db push --dry-run`, verify the linked target, and explicitly approve the real
`pnpm exec supabase db push`. Never use `db reset --linked` for this project.

### Email confirmation and immediate signup

Local email confirmation is disabled in `supabase/config.toml`, so email/password signups establish a session and
redirect immediately to the dashboard. Before deploying, disable **Email Confirmations** in the hosted project's
Supabase dashboard too; local configuration does not mutate the hosted project. This app has no confirmation callback
or replacement signup email.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

### Deliberate user-data reset

Resetting users is destructive and must be performed only after recording a backup and confirming the exact target.
Foreign-key cascades delete the user's private application data, including encrypted provider keys and workouts.
Refresh sessions are invalidated, but an already-issued JWT can remain accepted until it expires.

For local development only, run `pnpm exec supabase db reset --local`; never add `--linked`. This rebuilds the local
database from the committed migrations and removes local Auth/application rows.

For a hosted project, an authorized operator must first confirm its project ref, capture any required backup, and
check whether Storage contains user-owned objects. Remove those objects through the dashboard if present, then
hard-delete every Auth user through the confirmed project's Supabase dashboard (or a separately secured Admin API
operation). Apply the migration only after `pnpm exec supabase db push --dry-run` has been reviewed and the operator
has explicitly approved the confirmed target. Do not put a service-role credential in this app, its environment files,
or shell history.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
pnpm build
```

2. Deploy with Wrangler:

```bash
pnpm exec wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `pnpm exec wrangler secret put`.
After explicit approval for hosted setup, configure the credential-encryption secret separately:

```bash
pnpm exec wrangler secret put AI_KEY_ENCRYPTION_KEY_V1
pnpm exec wrangler secret put OPENROUTER_MODEL
pnpm exec wrangler secret put AI_CONFIRMATION_SIGNING_SECRET
```

Paste each secret only into Wrangler's hidden prompt. Do not pass secret values as command-line arguments or store
them in `wrangler.jsonc`. Set `OPENROUTER_MODEL` to the fixed OpenRouter model identifier through its own hidden
prompt; it must never be accepted from a browser request. `AI_CONFIRMATION_SIGNING_SECRET` must be independently
generated and rotated as a separate secret; rotation invalidates only outstanding short-lived reduced confirmations.
The Worker encryption root is distinct from user-owned OpenRouter credentials: do not place any user API key in a
Worker secret, `.dev.vars`, or `.env.production`.

### AI workout smoke check

After deploying the Worker, use disposable accounts and keys only. First use an account with no completed workouts:
add its key through `/account`, generate a five-to-seven-exercise proposal at `/workouts/new`, edit it, save it, and
complete it. Confirm this cold-start path remains available. Preference controls may appear in the shared catalogue;
they affect only subsequent history-aware proposals and never alter the current draft.

Then prepare separate history-aware fixtures for at least five ready candidates, exactly three or four ready
candidates, and fewer than three. Verify five-plus produces only the normal proposal; three or four displays the exact
count and makes no provider call until confirmation; and fewer than three leaves manual planning available without a
provider call. Like one eligible exercise and mark another **Don't suggest**; after a later generation, confirm the
states persist, remain mutually exclusive, and affect only the later proposal. Save and complete a history-aware
proposal, then confirm its owner-scoped lifecycle evidence without exposing proposal contents.

Inspect the retention job with the safe SQL queries above, including a recent successful run. When testing expired
fixtures, confirm cleanup preserves durable preferences and workout history. Remove every disposable key when finished.

Use only sanitized operational diagnostics while testing:

```bash
pnpm exec wrangler tail
```

Logs and browser payloads must never contain an OpenRouter credential, confirmation token, prompt, raw provider
response, generated prescription, proposal/event content, or user identifier.

## CI

GitHub Actions starts an isolated local Supabase stack and runs reset, database lint, pgTAP tests, lifecycle and
mutation concurrency tests, generated-type drift detection, AI provider cryptography, the dedicated
`pnpm test:ai-workout` contract suite, Astro sync, repository lint, and the Cloudflare Worker build as separate gates
on every push and PR to `master`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build
step; use only a publishable or anon key. CI never calls a real OpenRouter provider or uses production credentials.

## License

MIT
