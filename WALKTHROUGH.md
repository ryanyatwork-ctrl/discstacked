# DiscStacked End-to-End Verification & Movie Collector Audit

DiscStacked has been audited, strengthened, and verified end-to-end with a focus on the movie collection lifecycle, spreadsheet imports, thrift store barcode scanning, packaging format accuracy, and missing disc tracking.

---

## Key Areas Verified & Enhanced

### 1. Excel / CSV Imports from Blu-ray.com & Collectorz (CLZ) Movie Collector
- **Full Format Support**: DiscStacked accepts `.xlsx`, `.xls`, `.csv`, `.tsv`, and `.txt` files directly with full client-side parsing via SheetJS.
- **19-Column Blu-ray.com CSV Ingestion**:
  - Fixed header recognition (`isLikelyHeaderRow`) so CSV exports from Blu-ray.com with custom column layouts (e.g. `Title, Studio, Country code, UPC, EAN, ASIN, Release date, Slipcover, Casing, Memorabilia, Blu-ray discs, DVD discs, Digital copy, Date added, Watched, Comment, Retailer, Price, Price comment`) parse all rows flawlessly.
  - Automatically extracts release years from full date strings (e.g., `"August 24 2010"` → `2010`).
  - Automatically detects formats from discrete disc counts (`Blu-ray discs: 1`, `DVD discs: 1`, `Digital copy: 1` → formats: `["Blu-ray", "DVD", "Digital"]`).
  - Automatically normalizes 13-digit EANs starting with `0` to standard 12-digit UPCs (e.g., `0014381600353` → `014381600353`).
  - Automatically maps slipcovers (`1` → `has_slip`, `0` → `no_slip`), casings (`Standard Blu-ray case`, `SteelBook`, `DigiBook`), and watch history.
- **Digital-on-Disc & Physical Digital Copy Disc Support**:
  - Added full support for `"Digital Copy Disc"` and `"Digital-on-Disc"` (for earlier DVD/Blu-ray releases from ~2008–2012 that included a physical disc for PC/Mac/iTunes transfer).
  - Physical Digital Copy Discs are preserved as actual disc entries in `metadata.discs` and formatted with the `Digital Copy Disc` badge.
  - Digital Code Status accepts `Included (Unused)`, `Used / Redeemed`, `Digital Copy Disc (Digital-on-Disc)`, `Missing`, `Expired`, and `Not Included`.
- **Downloadable Collector Spreadsheet Template**:
  - Added a **"Download Template (.csv)"** button directly in the Import dialog.
  - Generates ready-to-use CSV templates customized by media tab (Movies/TV, CDs, Games) containing all supported column headers and sample collector items with expected values and an embedded field key guide.
- **HTML Entity Decoding**: Added automatic decoding (`&amp;` → `&`, `&#39;` → `'`, `&quot;` → `"`, `&ndash;` → `–`, `&hellip;` → `…`, numeric entities `&#nn;` / `&#xnn;`) so titles and edition notes import cleanly as real text.
- **Comprehensive Column Mapping**: Extended column normalization to recognize all common Blu-ray.com and CLZ Movie Collector headers.

---

### 2. Thrift Store Barcode Scanning & Exact Edition Matching
- **Collector-First Resolution Pipeline**:
  1. **DiscStacked Edition Catalog & Client Overrides**: Instant match against previously confirmed collector editions and multi-movie/TV sets by exact barcode.
  2. **Blu-ray.com Integration**: Live barcode lookup directly against Blu-ray.com to retrieve exact physical packaging titles, edition names, disc counts, physical format breakdowns, slipcover expectations, and packaging photos.
  3. **UPCitemdb & TMDb Fallbacks**: Enriched with high-res cover art, cast, director, runtime, rating, and overview.
- **TV & Multi-Movie Routing**:
  - TV box sets and single TV seasons automatically route to the **TV** collection tab (`media_type: "tv-season"`), even if scanned from the Movies tab.
  - Multi-movie collections open the multi-title importer with every individual film identified.

---

### 3. Packaging Formats & Missing Disc Tracking
- **Granular `DiscEntry` Model**:
  - `format`: 4K, Blu-ray, 3D, DVD, CD, Digital Copy Disc, Digital
  - `label`: Custom label (e.g. `Disc 1 (Theatrical)`, `Disc 2 (Bonus Features)`, `Disc 3 (Digital Copy Disc)`)
  - `missing`: Boolean toggle with alert badge and strike-through styling
  - `aspectRatio`: Widescreen, Fullscreen, Scope, Flat, etc.
  - `condition`: Mint, Good, Scratched, Damaged, Missing
  - `replacementNeeded`: Replacement flag
  - `notes`: Per-disc notes field to record specific missing disc notes or condition details (e.g. *"Missing bonus disc from thrift purchase"*, *"Disc 2 scratched"*).
- **Auto-Populated Discs on Edit**:
  - When opening collector details for any movie, the disc editor auto-populates the package's physical formats if the list was previously uninitialized.

---

## Verification Results

### Automated Test Suite
- **Vitest Unit Tests**: `80 / 80 passed` across 9 test files:
  - `src/test/import-utils.test.ts` (32 tests — 19-column Blu-ray.com exports, Digital-on-Disc, HTML entities, CLZ mapping, TV detection, packaging discs)
  - `src/test/edition-utils.test.ts` (3 tests)
  - `src/test/media-item-utils.test.ts` (3 tests)
  - `src/test/sort-mode.test.ts` (9 tests)
  - `src/test/cover-utils.test.ts` (3 tests)
  - `src/test/image-proxy.test.ts` (23 tests)
  - `src/test/public-env.test.ts` (3 tests)
  - `src/test/music-media-mirror.test.ts` (3 tests)
  - `src/test/example.test.ts` (1 test)
- **Edge Function Detection Suite**: `92 / 92 passed`
- **Vite Production Build**: Succeeded in `3.35s` with zero errors.
