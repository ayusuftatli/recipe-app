# Recipe Box — Project Spec

A lightweight, single-user recipe app for web and Android (installable PWA).
Recipes are versioned, parsed by an LLM, scalable by weight, and have
calculated nutrition.

This file is the source of truth for the coding LLM. Build one milestone at a
time (see "Milestones") and do not start the next until the current one meets
its acceptance criteria.

---

## 1. Principles

- **Personal use only.** One user, one password. No multi-user, households,
  sharing or social features.
- **Lightweight.** One Railway service, one SQLite file, minimal dependencies.
  Do not add a dependency when a few lines of code will do.
- **Versions are immutable.** A `recipe_versions` row is never updated or
  deleted. Every edit inserts a new version.
- **The LLM structures; it does not invent.** The LLM parses text into the
  schema and matches ingredients to food database entries. It never produces
  nutrition numbers directly.
- **Nothing the LLM produces is saved without review.** Every import goes
  through an editable review screen before saving.
- **Grams are the basis.** Every ingredient carries an estimated weight in
  grams where possible; scaling and nutrition are computed from grams.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| App framework | SvelteKit with `@sveltejs/adapter-node` (UI + API routes in one app) |
| Database | SQLite via `better-sqlite3` |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Validation / shared types | Zod (one schema used by API, UI and LLM output) |
| LLM | OpenRouter (OpenAI-compatible chat completions API) |
| Images | `sharp` (resize + convert to WebP) |
| PWA | `@vite-pwa/sveltekit` (service worker + manifest) |
| Offline storage | IndexedDB (via `idb`) |
| Tests | Vitest (required for scaling and nutrition math) |
| Hosting | Railway, single service, volume mounted at `/data` |

---

## 3. Data model

### 3.1 Tables

```
recipes
  id                  TEXT PRIMARY KEY      -- uuid
  current_version_id  TEXT NOT NULL         -- -> recipe_versions.id
  tags                TEXT NOT NULL DEFAULT '[]'   -- JSON array of strings (not versioned)
  photo_path          TEXT                  -- relative to PHOTO_DIR, nullable
  archived            INTEGER NOT NULL DEFAULT 0
  created_at          TEXT NOT NULL         -- ISO 8601
  updated_at          TEXT NOT NULL

recipe_versions                             -- IMMUTABLE: insert only
  id                  TEXT PRIMARY KEY
  recipe_id           TEXT NOT NULL         -- -> recipes.id
  version_number      INTEGER NOT NULL      -- 1, 2, 3 ... per recipe
  title               TEXT NOT NULL
  servings            REAL                  -- nullable (e.g. sauces)
  yield_g             REAL                  -- optional measured final weight (after cooking loss)
  ingredients         TEXT NOT NULL         -- JSON, see Ingredient schema
  steps               TEXT NOT NULL         -- JSON, see Step schema
  notes               TEXT
  source_url          TEXT
  change_note         TEXT                  -- e.g. "less molasses, +10 g garlic"
  created_at          TEXT NOT NULL
  UNIQUE (recipe_id, version_number)

foods                                       -- nutrition cache, shared across recipes
  id                  TEXT PRIMARY KEY
  name                TEXT NOT NULL         -- canonical display name
  source              TEXT NOT NULL         -- 'usda' | 'off' | 'manual'
  source_id           TEXT                  -- FDC id or OFF barcode
  nutrients_per_100g  TEXT NOT NULL         -- JSON, see Nutrients schema
  created_at          TEXT NOT NULL
  UNIQUE (source, source_id)
```

Restoring an old version = inserting a new version that copies the old one's
content, with `change_note = "Restored from v{n}"`.

### 3.2 Zod schemas (single source of truth, in `src/lib/schema.ts`)

```ts
Ingredient = {
  id: string            // uuid, stable across versions when the ingredient is "the same"
  group?: string        // section heading, e.g. "Sauce", "Marinade"
  qty: number | null    // as written, e.g. 2
  unit: string | null   // as written, normalised lowercase: g, kg, ml, l, tsp, tbsp, cup, piece, pinch, clove ...
  name: string          // e.g. "red onion"
  note?: string         // e.g. "finely chopped"
  grams: number | null  // estimated weight in grams for the given qty/unit
  grams_estimated: boolean  // true if grams came from an LLM estimate, false if exact (unit was g/kg)
  optional?: boolean
  food_id?: string | null   // -> foods.id once matched
}

Step = { id: string; text: string; group?: string }

Nutrients = {           // all per 100 g
  kcal: number; protein_g: number; fat_g: number; sat_fat_g?: number
  carbs_g: number; sugar_g?: number; fiber_g?: number; salt_g?: number
}

RecipeDraft = {         // what the LLM returns and what the review form edits
  title: string
  servings: number | null
  yield_g: number | null
  ingredients: Ingredient[]
  steps: Step[]
  notes?: string
  source_url?: string
}
```

Generate the LLM's JSON schema from `RecipeDraft` (e.g. `zod-to-json-schema`)
so the LLM output and the app can never drift apart.

---

## 4. Features

### 4.1 Recipes (CRUD)
- List: thumbnail, title, tags; search box; tag filter chips.
- Search matches title and ingredient names (SQLite `json_each` over the
  current version's ingredients; `LIKE` is fine at personal scale).
- Detail view: photo, ingredients (grouped), steps, notes, version badge.
- Create/edit form: same editable form used by the import review screen.
  Saving an edit asks for an optional change note and inserts a new version.
- Archive instead of delete (hard delete only from a settings screen with
  confirmation).

### 4.2 Version history
- Timeline: version number, date, change note.
- Diff between any two versions: ingredients matched by `Ingredient.id`,
  showing added / removed / changed (qty, unit, grams, name); steps and notes
  as a text diff.
- "Restore this version" (see 3.1).

### 4.3 LLM import
Inputs (one per import):
1. **Free text**: pasted recipe.
2. **URL**: server fetches the page. If it contains schema.org `Recipe`
   JSON-LD, pass that; otherwise strip HTML to readable text (cap ~15k chars).
3. **Photo**: an image of a printed or handwritten recipe (vision model).

Flow:
1. Send input + system prompt + JSON schema to OpenRouter with structured
   output (`response_format: json_schema`).
2. Validate with Zod. On failure, retry once with the validation errors
   included; on second failure, show the raw text so the user can fix it.
3. Show the **review screen** (editable form). Highlight ingredients where
   `grams_estimated = true` or `grams = null`.
4. Save only on user confirmation → creates recipe + version 1.

System prompt requirements:
- Keep quantities and units as written; do not convert in `qty`/`unit`.
- Estimate `grams` for every ingredient where reasonable (e.g. "1 medium
  onion" ≈ 150 g, "1 tbsp olive oil" ≈ 13.5 g); set `grams_estimated: true`.
  Use `null` for "salt to taste" and similar.
- Split steps into separate, concise steps; keep group headings.
- Never invent ingredients or steps that are not in the source.
- Output language = source language.

Settings: `LLM_MODEL` env var (must support JSON-schema output and image
input). Show the approximate cost of each import (from the OpenRouter
response's usage data) in the server log.

### 4.4 Scaling
All scaling is client-side, display-only (does not create a version unless
the user explicitly clicks "Save as new version").

Let `total_g` = sum of `grams` over non-optional ingredients with non-null
grams. Modes:

| Mode | Input | Factor |
|---|---|---|
| Servings | target servings | `target / servings` |
| Total weight | target grams | `target / total_g` |
| Anchor ingredient | ingredient + available grams | `available / ingredient.grams` |
| Per 100 g | — | shows each ingredient as `grams / total_g * 100` (%) |

Rules:
- Scale both `grams` and `qty` by the factor.
- Ingredients with `grams = null` scale by `qty` only and are flagged.
- Rounding: grams ≥ 100 → whole numbers; 10–100 → 0.5; < 10 → 0.1.
  `qty` for piece-like units → nearest 0.25 with fractions shown (½, ¼, ¾).
- Pure functions in `src/lib/scaling.ts` with Vitest tests for every mode,
  null grams, zero/missing totals, and rounding.

### 4.5 Nutrition
1. For each ingredient without `food_id`, search USDA FoodData Central
   (`/v1/foods/search`, needs free `FDC_API_KEY`); fall back to Open Food
   Facts search.
2. Send the top ~5 candidates to the LLM; it returns only the chosen
   candidate's id (or "none"). Never accept nutrient numbers from the LLM.
3. Store the chosen food in `foods` (cache by `source + source_id`) and
   set `food_id` on the ingredient. Reuse cached foods by name before
   calling external APIs.
4. Compute: `sum(grams / 100 * nutrients_per_100g)` → totals, per serving
   (if `servings`), per 100 g (divide by `yield_g` if set, else `total_g`).
5. UI: nutrition table + coverage indicator ("8 of 10 ingredients matched")
   and the user can change a match manually.
6. Pure computation in `src/lib/nutrition.ts` with Vitest tests.

Matching an ingredient creates a new version (it changes ingredient data);
batch all matches from one "Calculate nutrition" action into a single version
with change note "Nutrition matching".

### 4.6 Photos
- Upload from file or Android camera (`<input type="file" accept="image/*" capture="environment">`).
- Server resizes with sharp: full (max 1600 px, WebP q80) and thumb (400 px).
- Stored in `PHOTO_DIR`; served via an authenticated route.
- The photo used for an import can optionally become the recipe photo.

### 4.7 Auth
- Single password from `APP_PASSWORD` env var (constant-time comparison).
- Signed, httpOnly, secure, SameSite=Lax session cookie, 30-day expiry,
  signed with `SESSION_SECRET`.
- Every page and API route requires a session except `/login` and static
  PWA assets.
- Rate limit login (5 attempts / 15 min / IP) and LLM routes
  (30 requests / hour) with a simple in-memory limiter.

### 4.8 PWA and offline
- Manifest: name, icons (192 and 512 px), `display: standalone`, theme color.
- Service worker caches the app shell.
- On each online load, sync recipe list + current versions + thumbnails into
  IndexedDB.
- Offline: list, search and detail views (including scaling) work from
  IndexedDB; editing and import are disabled with an "Offline: read-only"
  banner.
- Cooking mode: large text, ingredient checklist, step-by-step, screen kept
  awake via the Wake Lock API.

### 4.9 Backup
- `GET /api/export`: JSON of all recipes, all versions and foods.
- `GET /api/export/db`: SQLite snapshot via `VACUUM INTO` a temp file.
- `POST /api/import`: restore from the JSON export (refuses if the database
  is not empty unless `?force=true`).

---

## 5. Configuration

| Env var | Purpose |
|---|---|
| `DATABASE_PATH` | `/data/recipes.db` on Railway |
| `PHOTO_DIR` | `/data/photos` on Railway |
| `APP_PASSWORD` | login password |
| `SESSION_SECRET` | 32+ random bytes |
| `OPENROUTER_API_KEY` | LLM access |
| `LLM_MODEL` | OpenRouter model id (JSON schema + vision support) |
| `FDC_API_KEY` | USDA FoodData Central |
| `ORIGIN` | public URL (required by adapter-node for form actions) |

Provide `.env.example` with all keys and no real values.

---

## 6. Deployment (Railway)

- One service built from the repo (Nixpacks or a small Dockerfile;
  `better-sqlite3` and `sharp` need native builds, so prefer a Dockerfile
  based on `node:22-slim`).
- Volume mounted at `/data`. Exactly one replica (SQLite).
- Run Drizzle migrations on startup before the server listens.
- Health check route: `GET /api/health` (no auth, returns `{ ok: true }`).

---

## 7. Milestones

**M1: Skeleton + CRUD + versions**
- SvelteKit app, Drizzle schema + migrations, auth, recipe list/detail/form,
  tags, search, photos, version timeline, diff, restore, deploy to Railway.
- Done when: a recipe can be created on the phone, edited twice, the diff
  between v1 and v3 shows correctly, v1 can be restored, and data survives a
  Railway redeploy.

**M2: LLM import**
- Text, URL and photo import → review screen → save.
- Done when: three sample inputs (pasted text, a recipe URL, a phone photo)
  each produce a valid draft, and invalid LLM output is retried/handled.

**M3: Scaling**
- All four modes + rounding, with tests.
- Done when: Vitest suite passes and the anchor mode works on the phone.

**M4: PWA + offline + cooking mode**
- Done when: the app installs on Android, recipes open in airplane mode, and
  the screen stays on in cooking mode.

**M5: Nutrition**
- Matching, caching, computation, coverage indicator, manual override.
- Done when: a 10-ingredient recipe shows totals, per serving and per 100 g,
  and re-running uses the cache without external calls.

**M6: Backup**
- Export JSON, export DB, import JSON.

---

## 8. Rules for the coding LLM

- Work on one milestone at a time; list the files you will change before
  changing them.
- TypeScript strict mode; no `any` without a comment explaining why.
- Never write code that updates or deletes `recipe_versions` rows.
- All request bodies validated with Zod at the API boundary.
- Keep business logic (scaling, nutrition, diff) in pure functions under
  `src/lib/` with Vitest tests.
- Do not add a dependency that is not in the stack table without asking.
- Never commit secrets; read everything from env vars.
- Mobile-first UI: must be usable one-handed at 380 px width.
