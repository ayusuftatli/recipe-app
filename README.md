# Recipe Box

Single-user recipe app (SvelteKit + SQLite). See [SPEC.md](SPEC.md) for the
full spec and milestones.

**Status:** Milestones 1 (CRUD, versions, photos, auth) and 2 (LLM import) are implemented.

Adding and changing recipes happens mainly through the **assistant chat**:
paste or type a recipe, send a link, or attach a photo of a recipe card, then
review the parsed result before saving. Follow-up messages ("use 3 eggs, add
1 tsp cumin") change the draft; on the edit page the same chat edits an
existing recipe and pre-fills the version's change note. The form is still
there for manual fixes.

## Local development

```sh
cp .env.example .env     # set APP_PASSWORD and SESSION_SECRET at least
npm install
npm run dev              # migrations run automatically on start
```

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm test` | Vitest unit tests (diff, form parsing, import helpers, LLM retry) |
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
   `/data/photos` in the image.
4. For the assistant, set `OPENROUTER_API_KEY` and `LLM_MODEL` (an
   OpenRouter model id that supports JSON-schema output and image input).
   The token count and cost of each request are written to the server log.

## Layout

- `src/lib/schema.ts` — Zod schemas shared by API and UI
- `src/lib/server/db/` — Drizzle schema and connection; migrations in `drizzle/`
- `src/lib/server/recipes.ts` — data access (versions are insert-only; a DB
  trigger also rejects updates to `recipe_versions`)
- `src/lib/diff.ts`, `src/lib/editor.ts` — pure logic with Vitest tests
- `src/lib/server/llm.ts` — OpenRouter client and system prompt; the JSON
  schema sent to the model is generated from the Zod schema
- `src/routes/api/` — JSON API (validated with Zod); pages under `src/routes/`
