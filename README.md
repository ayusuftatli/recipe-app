# Recipe Box

Single-user recipe app (SvelteKit + SQLite). See [SPEC.md](SPEC.md) for the
full spec and milestones.

**Status:** Milestones 1 (CRUD, versions, photos, auth), 2 (LLM import), 3 (scaling), 4 (PWA, offline, cooking mode), 5 (nutrition) and 6 (backup) are
implemented: every milestone of the spec.

Adding and changing recipes happens mainly through the **assistant chat**:
paste or type a recipe, send a link (the page's picture comes along), or
attach a photo of a recipe card, then review the parsed result before saving.
Follow-up messages ("use 3 eggs, add 1 tsp cumin") change the draft; on the
edit page the same chat edits an existing recipe and pre-fills the version's
change note. The form is still there for manual fixes.

A recipe page can be **scaled** by servings, by total weight, by the amount
of one ingredient you have, or shown as percentages of the total weight.
Scaling only changes what is displayed unless you press "Save as new version".

The app is an installable **PWA**. Every page opened while online refreshes a
copy of all recipes (current versions and thumbnails) on the device; without a
connection the app opens that copy read-only at `/offline`, with search and
scaling. Logging out removes the copy. "Start cooking" on a recipe opens
**cooking mode**: large text, an ingredient checklist, one step at a time, and
the screen kept awake where the browser supports it.

**Nutrition** is calculated, never estimated by the LLM. After a recipe is
saved or opened, a background job looks each new ingredient up in USDA
FoodData Central (falling back to Open Food Facts), lets the LLM pick the best
candidate, and stores the chosen food. The recipe page shows totals, per
serving and per 100 g, and lists every ingredient with its food, including the
ones nothing was found for. Ingredient names matched before are reused without
any lookup, and every match can be changed by hand (search, type in the values
from a label, or "No match").

**Backup** lives on the settings page: download everything as JSON
(`GET /api/export`: all recipes, versions and foods) or as the SQLite file
(`GET /api/export/db`), and restore a JSON backup (`POST /api/import`). A
restore into a database that already has data is refused unless you confirm
replacing everything (`?force=true`). Photos are files on the volume and are
not part of either backup; a restore keeps a recipe's photo only if the file
is still there.

## Local development

```sh
cp .env.example .env     # set APP_PASSWORD and SESSION_SECRET at least
npm install
npm run dev              # migrations run automatically on start
```

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm test` | Vitest unit tests (diff, form parsing, import helpers, LLM retry, scaling, offline search, nutrition, backup format) |
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
   `/data/photos` in the image. Also set `ADDRESS_HEADER=X-Forwarded-For`
   and `XFF_DEPTH=1`, so the login rate limit counts per visitor instead of
   treating everyone behind Railway's proxy as one address.
4. For the assistant, set `OPENROUTER_API_KEY` and `LLM_MODEL` (an
   OpenRouter model id that supports JSON-schema output and image input).
   The token count and cost of each request are written to the server log.
5. For nutrition, set `FDC_API_KEY` (free, from
   <https://fdc.nal.usda.gov/api-key-signup>). Without it only Open Food
   Facts is searched.

## Layout

- `src/lib/schema.ts` — Zod schemas shared by API and UI
- `src/lib/server/db/` — Drizzle schema and connection; migrations in `drizzle/`
- `src/lib/server/recipes.ts` — data access (versions are insert-only; a DB
  trigger also rejects updates to `recipe_versions`)
- `src/lib/diff.ts`, `src/lib/editor.ts`, `src/lib/scaling.ts` — pure logic with Vitest tests
- `src/lib/server/llm.ts` — OpenRouter client and system prompt; the JSON
  schema sent to the model is generated from the Zod schema
- `src/service-worker.ts` — caches the app shell and sends page loads to
  `/offline` when the server can't be reached (only active in a production
  build: `npm run build && npm start`)
- `src/lib/offline.ts`, `src/lib/offline-view.ts` — the IndexedDB copy and its
  search/filter logic
- `src/lib/nutrition.ts`, `src/lib/food-sources.ts` — nutrition math and
  parsing of the food databases' answers (pure, tested);
  `src/lib/server/nutrition.ts` does the matching
- `src/routes/api/` — JSON API (validated with Zod); pages under `src/routes/`
