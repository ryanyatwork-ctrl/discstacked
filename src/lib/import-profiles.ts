/**
 * Import source profiles.
 *
 * Different collection managers export different column sets with different
 * quirks. Rather than one column map guessing at everything, each known
 * source gets a profile: the columns that identify it, extra aliases beyond
 * the shared COLUMN_MAP, and the specific ways its files misbehave.
 *
 * The UI picks a profile automatically from the header row and lets the user
 * override it — detection is a convenience, never a lock-in. An unrecognised
 * file falls back to "generic", which is exactly today's behaviour.
 *
 * PROVENANCE OF QUIRKS
 * --------------------
 * Quirks marked "verified" were measured against a real export file. Quirks
 * marked "defensive" are safe assumptions we have not yet confirmed against
 * a sample — they only ever make the importer more careful, never less, so
 * being wrong about them costs a review flag rather than bad data. Replace
 * them with verified values as real files come in.
 */

export type ImportSourceId = "bluray-com" | "clz" | "discstacked" | "generic";

export interface SourceQuirks {
  /**
   * Barcodes are exported as numbers, so leading zeros are stripped and the
   * value needs restoring before it will match anything.
   */
  barcodeLosesLeadingZeros: boolean;
  /** Example date shape, for parser hints and UI copy. */
  dateStyle: "Month D YYYY" | "ISO" | "locale" | "unknown";
  /**
   * Column to fall back on when the film year is missing or zero — box sets
   * and collections have no single film year, but do have an edition year.
   */
  yearFallbackColumn?: string;
  /** Characters that separate multiple formats in one cell. */
  formatDelimiters: string[];
  /** Format tokens arrive with inconsistent casing (BLU-RAY / Bluray). */
  formatCaseInconsistent: boolean;
  /** Template columns are frequently present but entirely empty. */
  hasEmptyTemplateColumns: boolean;
  confidence: "verified" | "defensive";
  notes: string;
}

export interface ImportSourceProfile {
  id: ImportSourceId;
  label: string;
  description: string;
  /**
   * Headers that identify this source. Weight reflects distinctiveness:
   * a column only this source emits is worth more than a generic one.
   */
  signature: Array<{ header: string; weight: number }>;
  /** Extra header -> canonical key mappings layered over COLUMN_MAP. */
  columnAliases: Record<string, string>;
  quirks: SourceQuirks;
}

const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const IMPORT_PROFILES: Record<ImportSourceId, ImportSourceProfile> = {
  "bluray-com": {
    id: "bluray-com",
    label: "Blu-ray.com",
    description:
      "Collection export from a Blu-ray.com account. Rich on packaging " +
      "(case type, slipcover, digital codes), light on personal fields.",
    signature: [
      { header: "Blu-Ray Release Year", weight: 5 },
      { header: "Digital Code Status", weight: 4 },
      { header: "Digital Platform", weight: 3 },
      { header: "Missing Discs / Notes", weight: 3 },
      { header: "Studio / Distributor", weight: 2 },
      { header: "Case Type", weight: 2 },
      { header: "Slipcover", weight: 2 },
      { header: "Movie Release Year", weight: 2 },
      { header: "Disc Count", weight: 1 },
    ],
    columnAliases: {
      // Already covered by COLUMN_MAP, restated so the profile is
      // self-describing and survives changes to the shared map.
      "blu-ray release year": "_package_year",
      "movie release year": "year",
      "digital code status": "_digital_code_status",
      "digital platform": "_digital_platform",
      "studio / distributor": "_studio",
      "missing discs / notes": "notes",
    },
    quirks: {
      // Measured on a real 496-row export: 268 of 496 barcodes (54%) had
      // lost their leading zero, and every one was recoverable by padding.
      barcodeLosesLeadingZeros: true,
      dateStyle: "Month D YYYY",
      // 45 of 496 rows had movie year 0 or blank — all box sets, collections
      // and TV seasons — while the package year was populated on all 496.
      yearFallbackColumn: "Blu-Ray Release Year",
      formatDelimiters: [","],
      // Observed BLU-RAY / BLURAY / Bluray and DIGITAL / Digital in one file.
      formatCaseInconsistent: true,
      // Edition, Region, Rating, Genre, Watched, Purchase Price, Purchase
      // Location and Date Added were present but empty in every row.
      hasEmptyTemplateColumns: true,
      confidence: "verified",
      notes:
        "Verified against a 496-row export. Cell fills are NOT preserved by " +
        "this export path, so any colour coding in the user's own sheet is " +
        "lost before import — ask for the original file if colours matter.",
    },
  },

  clz: {
    id: "clz",
    label: "CLZ / Collectorz",
    description:
      "Export from CLZ Movies or Collectorz. Carries external IDs (TMDB, " +
      "IMDb) and per-format disc counts, which resolve far more precisely " +
      "than title matching.",
    signature: [
      { header: "Index Title", weight: 5 },
      { header: "CLZ AlbumID", weight: 5 },
      { header: "CLZ DiscID", weight: 5 },
      { header: "No. of Discs/Tapes", weight: 4 },
      { header: "Cat. Number", weight: 3 },
      { header: "Cover Front", weight: 3 },
      { header: "Cover Back", weight: 2 },
      { header: "User Tags", weight: 2 },
      { header: "Price Comment", weight: 2 },
      { header: "Sort Title", weight: 1 },
    ],
    columnAliases: {
      "index title": "sort_title",
      "no. of discs/tapes": "_disc_count",
      "cat. number": "_catalog_number",
      "cover front": "_cover_front",
      "clz albumid": "_clz_album_id",
    },
    quirks: {
      // Defensive: CLZ can export barcodes as text, but a user who opens the
      // file in Excel before uploading will strip zeros anyway. Padding is
      // checksum-guarded, so assuming true costs nothing when it is false.
      barcodeLosesLeadingZeros: true,
      dateStyle: "unknown",
      yearFallbackColumn: undefined,
      formatDelimiters: [",", ";", "/"],
      formatCaseInconsistent: true,
      hasEmptyTemplateColumns: false,
      confidence: "defensive",
      notes:
        "Not yet verified against a real CLZ export. Prefer its TMDB/IMDb " +
        "id columns over barcode or title matching when present — they give " +
        "exact identity. Replace these quirks once a sample file is seen.",
    },
  },

  discstacked: {
    id: "discstacked",
    label: "DiscStacked export",
    description:
      "A file previously exported from DiscStacked. Column names match our " +
      "own schema, so it round-trips without guessing.",
    signature: [
      { header: "Sort Title", weight: 3 },
      { header: "Barcode", weight: 1 },
      { header: "Formats", weight: 3 },
      { header: "Edition", weight: 2 },
      { header: "Disc Count", weight: 2 },
    ],
    columnAliases: {},
    quirks: {
      barcodeLosesLeadingZeros: false,
      dateStyle: "ISO",
      formatDelimiters: [","],
      formatCaseInconsistent: false,
      hasEmptyTemplateColumns: false,
      confidence: "defensive",
      notes: "Our own export format; barcodes are written as text.",
    },
  },

  generic: {
    id: "generic",
    label: "Other / generic spreadsheet",
    description:
      "Any other CSV or spreadsheet. Columns are matched by name against " +
      "the shared alias table.",
    signature: [],
    columnAliases: {},
    quirks: {
      // Unknown provenance, so assume the worst and let the check digit
      // decide. Repairs are only ever applied when they validate.
      barcodeLosesLeadingZeros: true,
      dateStyle: "unknown",
      formatDelimiters: [",", ";", "/", "|", "+"],
      formatCaseInconsistent: true,
      hasEmptyTemplateColumns: false,
      confidence: "defensive",
      notes: "No assumptions; every field is validated before use.",
    },
  },
};

export interface SourceDetection {
  id: ImportSourceId;
  label: string;
  score: number;
  /** Fraction of this profile's signature weight that was present (0..1). */
  confidence: number;
  matched: string[];
  missing: string[];
}

/**
 * Ranks profiles against a header row.
 *
 * Returns every profile scored, best first, so the UI can preselect the top
 * match and still offer the rest. "generic" always appears last as a floor.
 */
export function detectImportSource(headers: string[]): SourceDetection[] {
  const present = new Set(headers.map((h) => normKey(String(h ?? ""))).filter(Boolean));

  const scored: SourceDetection[] = [];

  for (const profile of Object.values(IMPORT_PROFILES)) {
    if (profile.id === "generic") continue;

    const total = profile.signature.reduce((sum, s) => sum + s.weight, 0);
    if (total === 0) continue;

    const matched: string[] = [];
    const missing: string[] = [];
    let score = 0;

    for (const sig of profile.signature) {
      if (present.has(normKey(sig.header))) {
        score += sig.weight;
        matched.push(sig.header);
      } else {
        missing.push(sig.header);
      }
    }

    scored.push({
      id: profile.id,
      label: profile.label,
      score,
      confidence: score / total,
      matched,
      missing,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.confidence - a.confidence);

  scored.push({
    id: "generic",
    label: IMPORT_PROFILES.generic.label,
    score: 0,
    confidence: 0,
    matched: [],
    missing: [],
  });

  return scored;
}

/**
 * The profile to use for a file, given its headers and any explicit user
 * choice. A user override always wins — detection never overrules a person
 * who knows where their file came from.
 */
export function resolveImportProfile(
  headers: string[],
  userChoice?: ImportSourceId,
): { profile: ImportSourceProfile; detection: SourceDetection[]; auto: boolean } {
  const detection = detectImportSource(headers);

  if (userChoice) {
    return { profile: IMPORT_PROFILES[userChoice], detection, auto: false };
  }

  const best = detection[0];
  // Require a real majority of the signature before claiming a match;
  // a couple of common columns is not evidence of provenance.
  const profile =
    best && best.confidence >= 0.5
      ? IMPORT_PROFILES[best.id]
      : IMPORT_PROFILES.generic;

  return { profile, detection, auto: true };
}

/** Human-readable summary for the import dialog. */
export function describeDetection(d: SourceDetection[]): string {
  const best = d[0];
  if (!best || best.confidence < 0.5) {
    return "Couldn't identify the source — treating it as a generic spreadsheet.";
  }
  return (
    `Looks like a ${best.label} export ` +
    `(${Math.round(best.confidence * 100)}% of its expected columns found).`
  );
}
