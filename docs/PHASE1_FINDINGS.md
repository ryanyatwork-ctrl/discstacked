# Phase 1 Findings — Barcode Scanning Diagnostic

Date: 2026-04-14
Scope: Tasks 1.1 and 1.2 (code reviews). Tasks 1.3 and 1.4 (live scans) are pending and require you + real barcodes.

---

## Task 1.1 — Barcode Lookup Chain

### Actual flow (source of truth: `supabase/functions/tmdb-lookup/index.ts`, lines 82–522)

The client's `lookupBarcode()` in `src/lib/media-lookup.ts` is a thin wrapper — all real logic lives in the edge function.

```
lookupBarcode(tab, barcode)
  └─> supabase.functions.invoke("tmdb-lookup", { barcode })
       │
       ├─ SOURCE 1: UPCitemdb                          (lines 366–390)
       │    HIT → cleanProductTitle() + detectFormats()
       │         → processBarcodeTitle(clean, raw, formats) → RETURN
       │    MISS/ERROR → log, continue
       │
       ├─ SOURCE 2: Discogs                            (lines 393–419)
       │    HIT → cleanProductTitle() + detectFormats()
       │         (inherits upcFormats if already detected — good)
       │         → processBarcodeTitle() → RETURN
       │    MISS/ERROR → log, continue
       │
       ├─ SOURCE 3: Open Library (ISBN)                (lines 422–445)
       │    Same pattern. Inherits upcFormats.
       │
       ├─ SOURCE 4: TMDB direct UPC/EAN find           (lines 448–480)
       │    Uses /find/{barcode}?external_source=upc
       │    movie_results → fetchTmdbMovieDetails → RETURN (rich metadata)
       │    tv_results    → basic TV payload → RETURN (no cast/crew/episode_count)
       │
       ├─ SOURCE 5: TMDB fuzzy title search (last resort) (lines 483–512)
       │    Uses upcCleanTitle only (not Discogs or OL title).
       │    60% token-overlap confidence threshold.
       │    isHighConfidence → fetchTmdbMovieDetails → RETURN
       │    Low confidence → soft-fail (partial title, no tmdb_id)
       │
       └─ All failed → barcode_not_found: true
```

### `processBarcodeTitle()` internals (lines 163–357)

This is where multi-movie detection and TV season detection happen.

```
processBarcodeTitle(cleanTitle, rawTitle, formats)
  │
  ├─ MULTI-MOVIE BRANCH                                (lines 165–269)
  │   Triggers if: cleanTitle contains " / " OR matches MULTI_MOVIE_KEYWORDS regex
  │   MULTI_MOVIE_KEYWORDS = /\b(collection|trilogy|quadrilogy|anthology|pack|
  │                             box\s*set|double|triple\s*feature|
  │                             [2-6]-(film|movie))\b/i
  │
  │   Path A — has slash:
  │     split("/") → TMDB search each title → build multi_movies[]
  │
  │   Path B — has keyword, no slash:
  │     Strip keyword to derive franchiseName
  │     Try /search/collection with [cleanTitle, franchiseName]
  │     STRICT match: collection.name (minus trailing "Collection") ≡ franchiseName
  │     If match: fetch /collection/{id} → all parts → multi_movies[]
  │     If no match: FALL THROUGH to single-movie lookup below (silently!)
  │
  ├─ TV SEASON BRANCH                                  (lines 273–322)
  │   normalizeTvSeasonTitle(cleanTitle) → { normalized, seasonNum }
  │   Matches "X: Season 7", "X - The Complete Seventh Season", etc.
  │   If seasonNum: search /search/tv → /tv/{id}/season/{n}
  │   Returns: tmdb_id, tmdb_series_id, season_number, episode_count, media_type="tv_season"
  │
  ├─ MOVIE FALLBACK                                    (lines 324–329)
  │   search/movie + fetchTmdbMovieDetails → full metadata (cast/crew/runtime)
  │
  ├─ TV FALLBACK (non-season)                          (lines 332–350)
  │   search/tv → basic data, media_type="tv"
  │   NO cast, crew, episode count, or tmdb_series_id
  │
  └─ PARTIAL FALLBACK                                  (line 353)
      Returns just { title, barcode_title, detected_formats }
```

### Critical failure points

| # | Where | Problem | Impact |
|---|-------|---------|--------|
| L-1 | edge `index.ts` line 193–199 | Strict equality match on collection name — case-insensitive but no fuzzy tolerance | "Lord of the Rings: The Motion Picture Trilogy" won't match "The Lord of the Rings Collection". Many trilogies silently fall through to single-movie lookup |
| L-2 | edge `index.ts` line 236, 268 | If multi-movie branch fails (no collection match, no slash-split results), there's no explicit error — control drops to single-movie lookup. UX sees only "found" (wrong title) instead of "looked like a set but couldn't resolve" | Silent wrong-data failures |
| L-3 | edge `index.ts` line 330–350 | TV (non-season) fallback returns no `episode_count`, no cast/crew. Also no TV-specific detail fetch | TV shows are tracked thinly |
| L-4 | `media-lookup.ts` lines 109–134 | Client's `direct` branch copies `tmdb_series_id` and `season_number` but NOT `episode_count` (server sends it for tv_season; field isn't declared on `MediaLookupResult`) | TV season metadata LOST between server and UI |
| L-5 | `media-lookup.ts` line 146 | `catch {}` → returns `{ status: "error" }`. The edge function's `_debug` array (which source hit/missed) is dropped | No visibility into why a barcode failed |
| L-6 | edge `index.ts` line 483 | TMDB fuzzy fallback uses ONLY `upcCleanTitle`, not Discogs/OL titles | Fuzzy retry misses cases where UPCitemdb was empty but Discogs had a title |
| L-7 | edge `index.ts` line 402 | Discogs `detectFormats` passes format array directly — good. But if UPCitemdb returned a garbage title, Discogs' cleaner title isn't preferred; first non-empty title wins | Poor title = poor TMDB lookup, can't recover |

---

## Task 1.2 — Scan → DB Save Flow

### Data transformation pipeline (`BulkScanDialog.tsx` → `usePhysicalProducts.ts`)

```
[camera/BT scan fires]
  └─> doLookup(barcode)                                 BulkScanDialog:82
       │
       └─> unifiedLookupBarcode(activeTab, barcode)     → edge function
            │
            ├─ result.multiMovie → ScanQueueItem {
            │       status: "multi_movie",
            │       formats: detected_formats,           ← array ✓
            │       format: detected_formats[0],         ← first only
            │       multiMovie: {...raw server payload...}
            │     }
            │
            └─ result.direct → ScanQueueItem {
                    status: "found",
                    format: detected_formats[0],
                    formats: detected_formats,
                    tmdb_id, title, year, ...,
                    extraMeta: { overview, cast, crew, ... }
                  }
                  ★ DROPS: tmdb_series_id, season_number, episode_count, media_type

[user clicks "Add N Items"]
  └─> handleCommit()                                    BulkScanDialog:343
       │
       ├─ singleItems bucket:
       │    Batch insert into media_items (chunks of 500):
       │      {
       │        format: formats[0],
       │        formats: full array,                     ✓
       │        external_id: tmdb_id,
       │        media_type: activeTab,                   ★ always the tab, never "tv_season"
       │        metadata: { runtime, tagline, artist,
       │                    author, ...extraMeta }       ★ no series_id/season_number
       │      }
       │    Then for each inserted row:
       │      createPhysicalProductForItem(...)
       │          → physical_products row (formats: array ✓)
       │          → media_copies row (format: formats[0] ONLY) ★
       │
       └─ multiItems bucket:
            for each item:
              createMultiMovieProduct(user, product, movies)
                  │
                  ├─ Insert physical_products:
                  │    { formats: array ✓,
                  │      media_type: activeTab,          ★ should be "box_set"
                  │      is_multi_title: true,
                  │      disc_count: movies.length }
                  │
                  └─ for each movie (sequentially — NOT batched):
                       1. Check existing by external_id=tmdb_id
                       2. Else check by case-insensitive title match
                       3. Else insert new media_item {
                            external_id: tmdb_id,
                            formats: product.formats,
                            format: formats[0],
                            metadata: { overview, runtime, cast, crew }
                                     ★ but only `overview` is ever passed in
                                       from the multiMovie payload
                          }
                       4. Insert media_copies { format: formats[0] ONLY } ★
```

### Critical failure points

| # | Where | Problem | Impact |
|---|-------|---------|--------|
| S-1 | `BulkScanDialog.tsx` lines 97–127 | `doLookup` direct branch doesn't carry `media_type`, `tmdb_series_id`, `season_number`, `episode_count` into the queue item | TV season scans lose all TV metadata at the UI layer |
| S-2 | `usePhysicalProducts.ts` lines 80–81, 242–243 | `media_copies.format = formats[0]` — only first format stored per copy row | UI reading from `media_copies` sees only one format even though `physical_products.formats` has the full array |
| S-3 | `BulkScanDialog.tsx` lines 401–416 | `multiItems` passes only `{tmdb_id, title, year, poster_url, overview}` per movie — drops runtime/cast/crew/genre (which the server's collection branch doesn't enrich anyway) | Individual movies in a set get thin metadata |
| S-4 | `tmdb-lookup/index.ts` lines 212–218 | Collection parts from `/collection/{id}` only include basic fields (title, overview, poster). No per-part `fetchTmdbMovieDetails` | Root cause for S-3: server doesn't enrich |
| S-5 | `usePhysicalProducts.ts` lines 139–247 | Multi-movie save is N+1 round-trips (check existing + upsert + media_copy, × N movies) | Slow for 10-movie sets; noticeable UI freeze during commit |
| S-6 | `BulkScanDialog.tsx` lines 405, 407; `usePhysicalProducts.ts` line 127 | `media_type: activeTab` for multi-movie physical_products (always "movies"), not "box_set" | Physical products can't be filtered by "box sets" in future queries |
| S-7 | `BulkScanDialog.tsx` lines 629–641 | Single-select format dropdown per queue item. User can't override when a product legitimately has multiple formats (4K + Blu-ray combo pack) | User has to edit after commit, or accept wrong format |
| S-8 | `usePhysicalProducts.ts` lines 143–168 | Dedup by external_id is per-user but doesn't distinguish "already owned individually" from "owned as part of a set" — silently reuses, no UX prompt | Matches doc's Task 3.1 concern |
| S-9 | `BulkScanDialog.tsx` lines 197–220, 309–316 | `alreadyOwned` check matches only by `barcode` on `media_items`. Multi-movie products put barcode on `physical_products`, not `media_items`. So re-scanning a box set won't trigger the "already owned" warning | Silent duplicate box-set scans |
| S-10 | `types.ts` MediaTab enum | `MediaTab` is `"movies" \| "music-films" \| "cds" \| "games"` — no "tv" discriminator at the tab level, and `media_items.media_type` gets set to the tab. TV season items end up with `media_type = "movies"` | Hard to query TV-specific items; breaks the Part 4 schema plan for `media_type: "movie" \| "tv" \| "tv_season" \| "box_set"` |

---

## Priority 1 Bug Shortlist (what to fix first)

Mapped to the plan's Part 6 table but tightened with actual file/line references:

### P1-A: TV season metadata pipeline is broken end-to-end
- **Server sends** `episode_count`, `tmdb_series_id`, `season_number`, `media_type: "tv_season"` on the direct result (edge line 290–304)
- **Client interface** (`MediaLookupResult`) has no `episode_count` field
- **Client `lookupBarcode`** (media-lookup.ts:109–134) doesn't copy `episode_count`
- **`ScanQueueItem`** doesn't carry `media_type`, `tmdb_series_id`, `season_number`, or `episode_count`
- **`handleCommit`** writes `media_type: activeTab` (always "movies") and never saves series_id/season/episodes to metadata
- **Fix span:** ~40 lines across 3 files. No DB migration needed (just store in `metadata` JSON).

### P1-B: Multi-select format UI + full-array propagation to `media_copies`
- Plan wants `media_copies.format` to reflect multi-format reality
- Two options:
  - (a) Keep `media_copies.format` as single string, but write one `media_copies` row per format (current schema-compatible)
  - (b) Change schema to `media_copies.formats` array (requires migration)
- Option (a) is cheaper and matches "one disc, one format" semantics better. Recommend (a).
- UI change: convert format selector to multi-select checkbox group (BulkScanDialog:629–641)

### P1-C: Edge function should return _debug reason to client on failure
- `_debug` array already exists (edge line 360) and is threaded into every response
- Client just doesn't surface it. Two-line fix in `lookupBarcode` + three-line fix in `ScanQueueItem.status` to hold a reason string

### P1-D: Multi-movie metadata enrichment on server
- After resolving collection.parts (edge line 211), `Promise.all(parts.map(p => fetchTmdbMovieDetails(p.id, key)))` to get runtime/cast/crew per movie
- Pass enriched `multi_movies` through to client, which already has plumbing in `createMultiMovieProduct` to save metadata

### P1-E: Box-set `media_type` tagging
- `physical_products.media_type` for multi-movie should be `"box_set"`, not `activeTab`
- Trivial fix in `createMultiMovieProduct` (usePhysicalProducts.ts:127) and BulkScanDialog:405
- Also: `media_items` for individual movies in a box set should still be `"movie"` (not "movies" — the plan wants a media_type enum distinct from MediaTab)

---

## What's NOT in this report (need your input)

- **Task 1.3 & 1.4 (live scans):** I can't run these. Need 3–5 real failing barcodes from Mark + access to the Supabase project (or the test dataset seeded somewhere I can query).
- **Current Supabase state:** I haven't read the migrations folder. If `media_copies.format` is already an array, some of P1-B is moot. Want me to check?
- **RLS/auth concerns for batch inserts:** if we switch to transactions, need to verify RLS policies don't fight us.

---

## Recommended next step

Two reasonable paths — your call:

**Path 1 (fast, user-visible):** P1-A (TV metadata end-to-end) — plan's Phase 4 in ~1 sitting. Clear win, no schema changes.

**Path 2 (foundational):** P1-C (debug propagation) first, since any further testing will be faster if we can see why lookups fail. Then P1-A.

I'd lean Path 2 — debug visibility pays for itself immediately. Which do you want?
