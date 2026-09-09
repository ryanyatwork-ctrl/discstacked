/**
 * Import preflight — a dry run that answers "will this file import cleanly?"
 * before a single row is written.
 *
 * Runs entirely offline against the parsed sheet: no network, no database, no
 * side effects. It reports what WOULD happen, per row, with the spreadsheet
 * line number so a problem can actually be found and fixed in the source file.
 *
 * SEVERITY MEANS SOMETHING SPECIFIC
 * ---------------------------------
 *   blocker — the row cannot be imported at all and will be skipped.
 *   warning — the row imports, but something was guessed, defaulted or
 *             degraded, so the result may be wrong in a way nothing
 *             downstream will flag.
 *   info    — worth knowing, nothing wrong.
 *
 * The distinction matters because a clean-looking import that quietly
 * defaulted 33 rows to Blu-ray is worse than one that refused them: the user
 * never learns which records to check.
 */

import { normalizeBarcode } from "@/lib/barcode-normalize";
import {
  resolveImportProfile,
  type ImportSourceId,
  type ImportSourceProfile,
  type SourceDetection,
} from "@/lib/import-profiles";

export type PreflightSeverity = "blocker" | "warning" | "info";

export interface PreflightIssue {
  severity: PreflightSeverity;
  code: string;
  /** 1-based row number as it appears in the spreadsheet, header included. */
  sheetRow: number;
  column?: string;
  title?: string;
  value?: string;
  message: string;
  /** What the user can do about it, in their own file. */
  suggestion?: string;
}

export interface PreflightRowResult {
  sheetRow: number;
  title: string;
  willImport: boolean;
  issues: PreflightIssue[];
}

export interface PreflightReport {
  profile: ImportSourceProfile;
  detection: SourceDetection[];
  autoDetected: boolean;

  totalRows: number;
  willImport: number;
  willFail: number;
  withWarnings: number;
  clean: number;

  rows: PreflightRowResult[];
  issues: PreflightIssue[];
  /** Issue counts by code, for a digest before the row-by-row list. */
  byCode: Array<{ code: string; severity: PreflightSeverity; count: number; message: string }>;

  unmappedColumns: string[];
  emptyColumns: string[];
  /** Rows that will merge into one record because they share a barcode. */
  duplicateGroups: Array<{ barcode: string; sheetRows: number[]; title: string }>;
}

export interface PreflightOptions {
  /** Force a source profile instead of detecting one. */
  sourceId?: ImportSourceId;
  /** Header row offset; sheets are 1-based and row 1 is the header. */
  headerRowNumber?: number;
}

const clean = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Columns we understand, however they are spelled. */
const KNOWN_COLUMN_KEYS = new Set(
  [
    "title", "name", "movietitle", "moviereleaseyear", "year", "releaseyear",
    "blurayreleaseyear", "blurayreleasedate", "releasedate", "format", "formats",
    "barcode", "upc", "ean", "upcean", "edition", "disccount", "discs",
    "noofdiscstapes", "casetype", "slipcover", "slipcase", "digitalcodestatus",
    "digitalplatform", "missingdiscsnotes", "notes", "studiodistributor",
    "studio", "region", "rating", "genre", "watched", "purchaseprice",
    "purchaselocation", "dateadded", "sorttitle", "indextitle", "tmdbid",
    "imdbid", "catnumber", "coverfront", "coverback", "usertags",
  ],
);

function findColumn(headers: string[], candidates: string[]): number {
  const normed = headers.map((h) => norm(clean(h)));
  for (const c of candidates) {
    const i = normed.indexOf(norm(c));
    if (i !== -1) return i;
  }
  return -1;
}

/**
 * @param headers Header row.
 * @param rows    Data rows, excluding the header.
 */
export function preflightImport(
  headers: string[],
  rows: unknown[][],
  options: PreflightOptions = {},
): PreflightReport {
  const headerRowNumber = options.headerRowNumber ?? 1;
  const { profile, detection, auto } = resolveImportProfile(headers, options.sourceId);

  const colTitle = findColumn(headers, ["Title", "Name", "Movie Title"]);
  const colBarcode = findColumn(headers, ["Barcode", "UPC", "EAN", "UPC/EAN"]);
  const colFormat = findColumn(headers, ["Format", "Formats", "Video Format"]);
  const colYear = findColumn(headers, ["Movie Release Year", "Year", "Release Year"]);
  const colPkgYear = findColumn(headers, [
    profile.quirks.yearFallbackColumn ?? "Blu-Ray Release Year",
    "Blu-Ray Release Year", "Package Year", "Physical Release Year",
  ]);

  const issues: PreflightIssue[] = [];
  const rowResults: PreflightRowResult[] = [];
  const barcodeIndex = new Map<string, { rows: number[]; title: string }>();

  // Which declared columns are entirely empty across the file.
  const nonEmptyCols = new Set<number>();
  const unmapped: string[] = [];
  headers.forEach((h, i) => {
    const label = clean(h);
    if (label && !KNOWN_COLUMN_KEYS.has(norm(label))) unmapped.push(label);
  });

  rows.forEach((row, idx) => {
    const sheetRow = headerRowNumber + idx + 1;
    const rowIssues: PreflightIssue[] = [];

    row.forEach((cell, ci) => {
      if (clean(cell) !== "") nonEmptyCols.add(ci);
    });

    const isBlank = !row.some((c) => clean(c) !== "");
    if (isBlank) return; // silently skipped, not worth an issue

    const title = colTitle >= 0 ? clean(row[colTitle]) : "";

    // ---- Title: the only true blocker. Without it nothing can be matched.
    if (!title) {
      rowIssues.push({
        severity: "blocker",
        code: "MISSING_TITLE",
        sheetRow,
        column: colTitle >= 0 ? clean(headers[colTitle]) : "Title",
        message: "Row has no title, so it cannot be identified or matched.",
        suggestion: "Add a title, or delete the row if it is a stray.",
      });
    }

    // ---- Barcode
    const rawBarcode = colBarcode >= 0 ? clean(row[colBarcode]) : "";
    if (!rawBarcode) {
      rowIssues.push({
        severity: "warning",
        code: "NO_BARCODE",
        sheetRow, title,
        column: "Barcode",
        message: "No barcode; matching falls back to title and year, which is less reliable.",
        suggestion: "Add the UPC/EAN from the back of the case for an exact match.",
      });
    } else {
      const n = normalizeBarcode(rawBarcode);

      if (n.ambiguous) {
        const best = n.candidates[0];
        rowIssues.push({
          severity: "warning",
          code: "BARCODE_AMBIGUOUS",
          sheetRow, title,
          column: "Barcode",
          value: rawBarcode,
          message:
            `Ten-digit barcode has ${n.candidates.length} valid readings; ` +
            `most likely ${best?.barcode}` +
            `${best?.prefixOwner ? ` (${best.prefixOwner})` : ""}. ` +
            `A lookup will decide, and the row is left alone if none matches.`,
          suggestion:
            `Enter the full 12-digit UPC from the case to remove the guesswork.`,
        });
      } else if (!n.valid) {
        rowIssues.push({
          severity: "warning",
          code: "BARCODE_INVALID",
          sheetRow, title,
          column: "Barcode",
          value: rawBarcode,
          message:
            "Barcode fails its check digit and cannot be repaired, so it will " +
            "not match anything. Import falls back to title and year.",
          suggestion: "Re-scan or retype the barcode from the case.",
        });
      } else if (n.repaired) {
        rowIssues.push({
          severity: "info",
          code: "BARCODE_REPAIRED",
          sheetRow, title,
          column: "Barcode",
          value: rawBarcode,
          message: `Leading zeros restored: ${rawBarcode} -> ${n.barcode}.`,
        });
      }

      if (n.barcode && n.valid) {
        const entry = barcodeIndex.get(n.barcode) ?? { rows: [], title };
        entry.rows.push(sheetRow);
        barcodeIndex.set(n.barcode, entry);
      }
    }

    // ---- Format
    const rawFormat = colFormat >= 0 ? clean(row[colFormat]) : "";
    if (!rawFormat) {
      rowIssues.push({
        severity: "warning",
        code: "NO_FORMAT",
        sheetRow, title,
        column: "Format",
        message: "No format listed; the record will default to Blu-ray.",
        suggestion:
          "Set the format (e.g. \"BLU-RAY,DVD,DIGITAL\") so multi-disc sets are not " +
          "recorded as a single Blu-ray.",
      });
    }

    // ---- Year
    const rawYear = colYear >= 0 ? clean(row[colYear]) : "";
    const yearNum = Number(rawYear);
    const hasMovieYear = Boolean(rawYear) && Number.isFinite(yearNum) && yearNum > 0;
    const rawPkgYear = colPkgYear >= 0 ? clean(row[colPkgYear]) : "";

    if (!hasMovieYear) {
      if (rawPkgYear) {
        rowIssues.push({
          severity: "info",
          code: "YEAR_FROM_PACKAGE",
          sheetRow, title,
          message:
            "No film year (normal for box sets); the edition's release year " +
            "will be used instead.",
        });
      } else {
        rowIssues.push({
          severity: "warning",
          code: "NO_YEAR",
          sheetRow, title,
          column: "Year",
          message:
            "No year of any kind. If the barcode does not resolve, title-only " +
            "matching is weak and may pick the wrong release.",
          suggestion: "Add either the film year or the edition's release year.",
        });
      }
    }

    issues.push(...rowIssues);
    rowResults.push({
      sheetRow,
      title: title || "(untitled)",
      willImport: !rowIssues.some((i) => i.severity === "blocker"),
      issues: rowIssues,
    });
  });

  // ---- Duplicates across the file
  const duplicateGroups: PreflightReport["duplicateGroups"] = [];
  for (const [barcode, entry] of barcodeIndex) {
    if (entry.rows.length < 2) continue;
    duplicateGroups.push({ barcode, sheetRows: entry.rows, title: entry.title });
    issues.push({
      severity: "info",
      code: "DUPLICATE_BARCODE",
      sheetRow: entry.rows[0],
      title: entry.title,
      value: barcode,
      message:
        `Rows ${entry.rows.join(", ")} share barcode ${barcode} and will merge ` +
        `into one record.`,
      suggestion:
        "If these are genuinely different editions, give each its own barcode.",
    });
  }

  const emptyColumns = headers
    .map((h, i) => ({ label: clean(h), i }))
    .filter((c) => c.label && !nonEmptyCols.has(c.i))
    .map((c) => c.label);

  // ---- Digest
  const codeMap = new Map<string, { severity: PreflightSeverity; count: number; message: string }>();
  for (const i of issues) {
    const e = codeMap.get(i.code);
    if (e) e.count++;
    else codeMap.set(i.code, { severity: i.severity, count: 1, message: i.message });
  }
  const severityRank: Record<PreflightSeverity, number> = { blocker: 0, warning: 1, info: 2 };
  const byCode = [...codeMap.entries()]
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || b.count - a.count);

  const willFail = rowResults.filter((r) => !r.willImport).length;
  const withWarnings = rowResults.filter(
    (r) => r.willImport && r.issues.some((i) => i.severity === "warning"),
  ).length;

  return {
    profile,
    detection,
    autoDetected: auto,
    totalRows: rowResults.length,
    willImport: rowResults.length - willFail,
    willFail,
    withWarnings,
    clean: rowResults.filter((r) => r.issues.length === 0).length,
    rows: rowResults,
    issues,
    byCode,
    unmappedColumns: unmapped,
    emptyColumns,
    duplicateGroups,
  };
}

/** One-line verdict for the top of the dialog. */
export function preflightHeadline(r: PreflightReport): string {
  if (r.willFail > 0) {
    return `${r.willImport} of ${r.totalRows} rows will import — ${r.willFail} cannot.`;
  }
  if (r.withWarnings > 0) {
    return `All ${r.totalRows} rows will import, but ${r.withWarnings} need a look.`;
  }
  return `All ${r.totalRows} rows look good.`;
}

/** Plain-text report for copying into a bug report or checking off by hand. */
export function formatPreflightReport(r: PreflightReport, maxRows = 50): string {
  const out: string[] = [
    preflightHeadline(r),
    "",
    `Source      : ${r.profile.label}${r.autoDetected ? " (detected)" : " (chosen)"}`,
    `Rows        : ${r.totalRows}`,
    `  clean     : ${r.clean}`,
    `  warnings  : ${r.withWarnings}`,
    `  blocked   : ${r.willFail}`,
  ];

  if (r.emptyColumns.length) {
    out.push("", `Empty columns: ${r.emptyColumns.join(", ")}`);
  }
  if (r.unmappedColumns.length) {
    out.push(`Unrecognised columns (ignored): ${r.unmappedColumns.join(", ")}`);
  }

  if (r.byCode.length) {
    out.push("", "Summary of findings:");
    for (const c of r.byCode) {
      out.push(`  [${c.severity.toUpperCase()}] ${c.code} x${c.count}`);
    }
  }

  const flagged = r.rows.filter((row) => row.issues.some((i) => i.severity !== "info"));
  if (flagged.length) {
    out.push("", `Rows needing attention (${flagged.length}):`);
    for (const row of flagged.slice(0, maxRows)) {
      out.push(`  Row ${row.sheetRow}: ${row.title}`);
      for (const i of row.issues.filter((x) => x.severity !== "info")) {
        out.push(`     [${i.severity}] ${i.message}`);
        if (i.suggestion) out.push(`        -> ${i.suggestion}`);
      }
    }
    if (flagged.length > maxRows) {
      out.push(`  ... and ${flagged.length - maxRows} more.`);
    }
  }

  return out.join("\n");
}
