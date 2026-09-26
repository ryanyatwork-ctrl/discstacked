import type { TablesInsert } from "@/integrations/supabase/types";
import type { MediaTab } from "@/lib/types";

export type ImportCheckSeverity = "blocker" | "warning";

export type ImportCheckIssue = {
  severity: ImportCheckSeverity;
  location: string;
  title: string;
  barcode: string;
  message: string;
};

export type ImportSourceRow = {
  sourceRow: number;
  title?: unknown;
  barcode?: unknown;
};

export type ImportCheckResult = {
  sourceRowCount: number;
  importItemCount: number;
  barcodeCount: number;
  missingBarcodeCount: number;
  blockers: ImportCheckIssue[];
  warnings: ImportCheckIssue[];
};

function cleanText(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function normalizeBoolean(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "y"].includes(value.trim().toLowerCase());
}

/**
 * Give every row the same required-column shape before a PostgREST bulk insert.
 * Mixed rows (some with a boolean and some omitting it) can otherwise serialize
 * the omitted values as null, bypassing the database column default.
 */
export function normalizeImportRowsForInsert(
  items: Partial<TablesInsert<"media_items">>[],
  mediaType: MediaTab,
  userId: string,
): Partial<TablesInsert<"media_items">>[] {
  return items.map((item) => {
    const {
      _mediaTypeOverride,
      _previewId,
      _sourceRows,
      ...rest
    } = item as Record<string, unknown>;
    const format = cleanText(rest.format) || null;
    const suppliedFormats = Array.isArray(rest.formats)
      ? rest.formats.map(cleanText).filter(Boolean)
      : [];

    return {
      ...rest,
      user_id: userId,
      media_type: cleanText(_mediaTypeOverride) || mediaType,
      title: cleanText(rest.title) || "Untitled",
      format,
      formats: suppliedFormats.length > 0 ? suppliedFormats : (format ? [format] : []),
      in_plex: normalizeBoolean(rest.in_plex),
      digital_copy: normalizeBoolean(rest.digital_copy),
      wishlist: normalizeBoolean(rest.wishlist),
      want_to_watch: normalizeBoolean(rest.want_to_watch),
    } as Partial<TablesInsert<"media_items">>;
  });
}

export function checkImportList(
  sourceRows: ImportSourceRow[],
  importItems: Record<string, unknown>[],
): ImportCheckResult {
  const blockers: ImportCheckIssue[] = [];
  const warnings: ImportCheckIssue[] = [];

  if (sourceRows.length !== importItems.length) {
    blockers.push({
      severity: "blocker",
      location: "List totals",
      title: "(count mismatch)",
      barcode: "",
      message: `${sourceRows.length} source rows produced ${importItems.length} prepared items. Import requires exactly one item per source row.`,
    });
  }

  for (const row of sourceRows) {
    if (!cleanText(row.title)) {
      blockers.push({
        severity: "blocker",
        location: `Source row ${row.sourceRow}`,
        title: "(missing title)",
        barcode: cleanText(row.barcode),
        message: "No title was found, so this source row cannot be matched or imported safely.",
      });
    }
  }

  importItems.forEach((item, index) => {
    const title = cleanText(item.title) || "(missing title)";
    const barcode = cleanText(item.barcode);
    const location = `Prepared item ${index + 1}`;

    if (!cleanText(item.title)) {
      blockers.push({
        severity: "blocker",
        location,
        title,
        barcode,
        message: "This prepared item has no title.",
      });
    }

    if (!barcode) {
      warnings.push({
        severity: "warning",
        location,
        title,
        barcode: "",
        message: "No barcode. The item can still import, but matching will rely on its title and other metadata.",
      });
    }

    if (item.rating != null && item.rating !== "") {
      const rating = Number(item.rating);
      if (!Number.isFinite(rating) || Math.abs(rating) > 99.9) {
        blockers.push({
          severity: "blocker",
          location,
          title,
          barcode,
          message: "Rating is outside the database range (-99.9 to 99.9).",
        });
      }
    }
  });

  const barcodeCount = importItems.filter((item) => Boolean(cleanText(item.barcode))).length;
  return {
    sourceRowCount: sourceRows.length,
    importItemCount: importItems.length,
    barcodeCount,
    missingBarcodeCount: importItems.length - barcodeCount,
    blockers,
    warnings,
  };
}

function csvCell(value: unknown): string {
  return `"${cleanText(value).replace(/"/g, '""')}"`;
}

export function importCheckToCsv(result: ImportCheckResult): string {
  const rows = [
    ["Severity", "Location", "Title", "Barcode", "Message"],
    ...[...result.blockers, ...result.warnings].map((issue) => [
      issue.severity,
      issue.location,
      issue.title,
      issue.barcode,
      issue.message,
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
