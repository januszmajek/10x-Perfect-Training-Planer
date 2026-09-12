# Perfect Training Planner

[![CI](https://github.com/januszmajek/10x-Perfect-Training-Planer/actions/workflows/ci.yml/badge.svg)](https://github.com/januszmajek/10x-Perfect-Training-Planer/actions/workflows/ci.yml)

**[Open the app](https://perfect-training-planner.januszmajekjm.workers.dev)**

Perfect Training Planner is a web app for recreational solo lifters who want to plan their next gym session without
guesswork. It is a public certification project for the third edition of 10xDevs and a hobby project.

After creating an account, a user can build a workout manually from the exercise catalogue or ask the AI proposer for
a recovery-aware plan. A planned workout stays editable until it is marked done; completed workouts become history and
inform later recommendations.

## What it does

- Creates workouts manually with catalogue search, muscle-group and equipment filters, and recovery-aware suggestions.
- Generates editable AI workout proposals from completed workout history, recovery windows, and exercise preferences.
- Keeps planned workouts separate from completed history, with editing, completion, and history filtering.
- Uses email/password authentication and isolates each user's workouts, preferences, and encrypted AI provider key.
- Uses a bring-your-own-key (BYOK) OpenRouter flow: the app does not provide or pay for a user's AI API key.

## Project documentation

- [Product requirements](./context/foundation/prd.md) — user flows, recovery rules, privacy boundaries, and non-goals.
- [Technical stack](./context/foundation/tech-stack.md) — framework and platform decisions.
- [Infrastructure](./context/foundation/infrastructure.md) — Cloudflare Workers rationale and operational risks.
- [Test plan](./context/foundation/test-plan.md) — test layers, commands, and when to use them.
- [Roadmap](./context/foundation/roadmap.md) — delivered slices and remaining work.
- [Repository guidelines](./AGENTS.md) — conventions, safety rules, and required verification for contributors.

## Run locally

The supported local environments are Omarchy (or another Linux distribution) and Windows through WSL2. Use a Linux
terminal for every command below. Native PowerShell is not a supported development path.

### Prerequisites

- Git
- Node.js 22.14.0 (see [`.nvmrc`](./.nvmrc)) with Corepack enabled
- Docker Engine running and available to the current Linux user
- At least 7 GB available to Docker for the local Supabase services

On Windows, install WSL2 and a Linux distribution, then install Docker Engine **inside that distribution**. Do not
share `node_modules` between Windows and WSL2; install dependencies from the Linux checkout. On Omarchy, use the
normal Linux Docker Engine and terminal setup.

Confirm the prerequisites before continuing:

```bash
node --version
docker version
corepack enable
corepack prepare pnpm@10.24.0 --activate
pnpm --version
```

### First-time setup

```bash
git clone https://github.com/januszmajek/10x-Perfect-Training-Planer.git
cd 10x-Perfect-Training-Planer
pnpm install --frozen-lockfile
pnpm exec supabase start
pnpm exec supabase db reset --local
```

The first `supabase start` downloads local service images. The committed migrations and seed data set up the exercise
catalogue and application schema; do not run `supabase init`.

Create ignored `.env` and `.dev.vars` files with the same local values. Get the local URL and publishable/anon key
from `pnpm exec supabase status`.

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<local-publishable-or-anon-key>
AI_KEY_ENCRYPTION_KEY_V1=<32-random-bytes-as-unpadded-base64url>
OPENROUTER_MODEL=<model-that-supports-strict-structured-json-output>
AI_CONFIRMATION_SIGNING_SECRET=<independent-high-entropy-secret>
```

`SUPABASE_URL` and `SUPABASE_KEY` are required for authentication and workout persistence. The three `AI_*` /
`OPENROUTER_*` values are required to save a user provider key and generate AI workouts; manual planning still works
without them. Use distinct high-entropy values for the encryption and confirmation secrets. Never commit, log, or put
real values in documentation.

`SUPABASE_KEY` must be a Supabase publishable key or legacy `anon` key—never a `service_role` or `sb_secret_...` key.
Each end user supplies their own OpenRouter key in **Account** after signing in. That user key is encrypted before
storage and must never be placed in `.env`, `.dev.vars`, or a Cloudflare Worker secret.

Start the app:

```bash
pnpm dev
```

Open the local URL printed by Astro. Supabase Studio is available at <http://localhost:54323>. Stop the local stack
when you are finished:

```bash
pnpm exec supabase stop
```

### Daily workflow

```bash
pnpm dev                         # run the app
pnpm lint                        # lint the repository
pnpm build                       # build the Cloudflare Worker
pnpm test:node                   # domain and API-contract tests
pnpm test:ui                     # React UI tests
pnpm exec playwright install chromium
pnpm test:e2e                    # browser journeys; requires local Supabase
```

Before a database migration is committed, reset the local database, check it, regenerate types, and format the
generated file:

```bash
pnpm exec supabase db reset --local
pnpm exec supabase db lint --local --schema public --fail-on error
pnpm exec supabase gen types typescript --local --schema public > src/types/database.types.ts
pnpm exec prettier --config .prettierrc.json --write src/types/database.types.ts
```

## Project layout

```text
src/
  pages/          Astro routes and API endpoints
  components/     Astro UI and interactive React components
  lib/            domain logic, Supabase access, and shared helpers
  middleware.ts   session lookup and protected-route handling
supabase/
  migrations/     versioned schema and catalogue changes
  tests/          database contracts and concurrency checks
context/
  foundation/     product, architecture, roadmap, and test contracts
  deployment/     deployment plan and deployment history
```

## Deployment

The app deploys as a Cloudflare Worker, not Cloudflare Pages. A deployment requires a Cloudflare account, Wrangler
authentication, a hosted Supabase project, and all server-side values configured as Worker secrets.

```bash
pnpm exec wrangler login
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_KEY
pnpm exec wrangler secret put AI_KEY_ENCRYPTION_KEY_V1
pnpm exec wrangler secret put OPENROUTER_MODEL
pnpm exec wrangler secret put AI_CONFIRMATION_SIGNING_SECRET
pnpm exec wrangler deploy
```

Enter values only at Wrangler's hidden prompts. Do not put secrets in `wrangler.jsonc` or command-line arguments.
Database migrations are a separate, reviewed operation: inspect the plan and run a dry run before any hosted change.
For the exact rollout, smoke checks, rollback notes, and Supabase Auth configuration, use the
[deployment plan](./context/deployment/deployment-plan.md).

## Contributing

Use pnpm, keep changes focused, and run the checks relevant to the modified area. Before handing off application code,
run at least `pnpm lint` and `pnpm build`. CI runs the full local Supabase, database, Node, UI, browser, lint, and build
pipeline for pushes and pull requests to `master`.
