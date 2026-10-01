# CLZ import was deleting discs the user owns

*Nightly agent, 2026-09-01. Fixed on `nightly/2026-09-01-clz-import-data-loss`.*

## What was wrong

`expandBoxSets()` in `src/lib/import-utils.ts` is the only step of the import
pipeline that can **remove** a row. The intent is narrow: once a box set's films
are present individually, the set entry is redundant, so it is hidden. In
practice the detection was loose enough that ordinary single films were
classified as box sets and dropped, with nothing added in their place.

Three independent defects combined:

1. **Disc count was treated as evidence.** `discCount > 2 → box set`. A 4K or 3D
   release routinely ships three to five discs for one film (UHD + Blu-ray +
   bonus + digital). So `Interstellar 4K`, `Dunkirk 4K`, `The Incredibles`,
   `Rogue One`, `Avengers: Endgame 4K` and a long tail of others were box sets
   as far as this function was concerned. Multi-disc documentary and TV sets that
   had not been routed to the TV tab — `Frozen Planet`, `The Blue Planet`,
   `I Love Lucy: Ultimate Season 1`, `1883` — were caught the same way.

2. **Keywords were bare substrings of the raw title.** The list was
   `["trilogy", "collection", "complete", "pack", "set", "bundle", "quadrilogy",
   "anthology", "saga"]`, tested with `title.includes(kw)`. `"set"` matches
   inside *Sun**set** Boulevard*; `"pack"` matches a `Neo-pack/Digipack`
   packaging note; `"saga"` matches *Furiosa: A Mad Max **Saga***, a single film
   on a single disc.

3. **Contents were matched by substring, and one match was enough to delete.**
   `normSetTitle.includes(normTitleOnly)` finds `her` inside `the shepherd` and
   `rio` inside `priority`. A single such coincidence marked the item confirmed
   and removed it. Worse, `addBoxSetSource()` was called *during* the scan, so
   films were tagged with box sets that were never confirmed.

Because the individual-film branch (`linkOrCreateIndividual`) only runs for
slash-separated titles, a false positive under (1)–(3) produced no replacement
row at all. The disc simply left the collection.

## Measured impact

Run against a real 2,722-row Collectorz Blu-ray export (a user's actual
collection; the file is **not** committed — it lives outside the repo under
`D:\Projects\Nightly\inputs\discstacked\`):

| | before | after |
|---|---|---|
| rows after dedupe | 2,706 | 2,706 |
| rows after `expandBoxSets` | 2,636 | 2,749 |
| distinct barcodes lost | **171 of 2,700 (6.3%)** | 60 of 2,700 (2.2%) |
| lost barcodes with no surviving record | 171 | **0** |

The 60 remaining are genuine slash-separated multi-film discs
(`Capote / In Cold Blood`), which are split into their component films by
design — and each component now carries the set's barcode and disc count in
`metadata.box_sets`, so nothing is untraceable.

## What changed

- `BOX_SET_KEYWORDS` → `BOX_SET_PATTERNS`, word-boundary regexes over the
  *normalized* title. `set`, `pack` and `saga` as bare words are gone; explicit
  phrases (`trilogy`, `collection`, `box set`, `3-Movie`, `Double Feature`,
  `Film Favorites`, `Complete Series`) remain. The patterns account for
  `normalizeTitle()` stripping hyphens without inserting a space, so
  `3-Movie` arrives as `3movie`.
- `isBoxSet()` no longer looks at disc count at all.
- Content matching uses whole-phrase containment, and ignores candidate titles
  short enough to collide by accident (under two words and under six characters).
- A set is hidden only on **two or more distinct confirmed contents**. One match
  is as likely to be a sequel sharing a franchise name as a real membership.
- Links are applied only after the set is confirmed, not during the scan.
- A slash title is not split when either side reads as packaging
  (`Digipack`, `Steelbook`, `Booklet`, `Fold Out`, …).
- `metadata.box_sets` entries now carry `barcode` and `disc_count`, so hiding a
  set no longer discards the identity of a physical item the user owns.

## Coverage

`src/test/import-utils.boxsets.test.ts` — 17 tests. On `main`, 10 of them fail;
on this branch all pass. Fixtures are hand-written release names, not user data.

## Not done

- **The set entry is still hidden rather than kept as a first-class item.** The
  docblock claimed the set "is preserved with a contents[] in metadata"; the code
  has always deleted it. This branch makes the deletion safe and traceable but
  does not change the behaviour, because showing box sets in the grid is a
  product decision, not a bug fix.
- **`year` is taken from the disc's release date**, not the film's. `$5 a Day`
  (a 2008 film) imports as 2010 because that is when the Blu-ray shipped. The
  CLZ movie export in hand carries no film-year column, so fixing this needs a
  TMDB lookup at import time.
- **TV detection does not catch documentary series** shipped as movies
  (`Frozen Planet`, `The Blue Planet: Seas of Life`). They now survive the import
  intact, but they land on the movies tab.
