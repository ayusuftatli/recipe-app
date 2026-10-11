# Recipe Box

Single-user recipe app (SvelteKit + SQLite). See [SPEC.md](SPEC.md) for the
full spec and milestones.

**Status:** Milestone 1 (skeleton, CRUD, versions, photos, auth) is implemented.

## Local development

```sh
cp .env.example .env     # set APP_PASSWORD and SESSION_SECRET at least
npm install
npm run dev              # migrations run automatically on start
```

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm test` | Vitest unit tests (diff, editor parsing) |
| `npm run check` | svelte-check / TypeScript |
| `npm run build && npm start` | production build (adapter-node) |
| `npm run db:generate` | create a migration after editing `src/lib/server/db/schema.ts` |

## Deploying to Railway

1. Create a service from this repo; Railway picks up `Dockerfile` and
   `railway.json` (health check `/api/health`, 1 replica).
2. Add a **volume** mounted at `/data` (the database and photos live there,
   so they survive redeploys).
3. Set variables: `APP_PASSWORD`, `SESSION_SECRET` (32+ random chars, e.g.
   `openssl rand -base64 48`), and `ORIGIN` (the public `https://…` URL).
   `DATABASE_PATH` and `PHOTO_DIR` default to `/data/recipes.db` and
   `/data/photos` in the image. LLM/nutrition keys are only needed from M2/M5.

## Layout

- `src/lib/schema.ts` — Zod schemas shared by API and UI
- `src/lib/server/db/` — Drizzle schema and connection; migrations in `drizzle/`
- `src/lib/server/recipes.ts` — data access (versions are insert-only; a DB
  trigger also rejects updates to `recipe_versions`)
- `src/lib/diff.ts`, `src/lib/editor.ts` — pure logic with Vitest tests
- `src/routes/api/` — JSON API (validated with Zod); pages under `src/routes/`
