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
```

Never use a `service_role` or `sb_secret_...` key in the application. Both local environment files are ignored by
git.

4. Verify the database contract:

```bash
pnpm exec supabase db lint --local --schema public --fail-on error
pnpm exec supabase test db --local supabase/tests/database
```

5. Regenerate and normalize TypeScript database types after any schema change:

```bash
pnpm exec supabase gen types typescript --local --schema public > src/types/database.types.ts
pnpm exec prettier --config .prettierrc.json --write src/types/database.types.ts
```

Commit the regenerated file. CI repeats this pipeline and fails if the committed types drift from a clean local
schema.

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

### Email confirmation in local development

Local email confirmation is disabled in `supabase/config.toml`, so disposable local users can sign in immediately.
Change hosted-project email settings in its Supabase dashboard when needed; local configuration does not mutate the
hosted project.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

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

## CI

GitHub Actions starts an isolated local Supabase stack and runs reset, database lint, pgTAP tests, generated-type
drift detection, Astro sync, repository lint, and the Cloudflare Worker build as separate gates on every push and PR
to `master`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets for the build step; use only a
publishable or anon key.

## License

MIT
