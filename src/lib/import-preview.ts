import { mapClzRow } from "@/lib/import-utils";
import type { MediaTab } from "@/lib/types";

/**
 * Prepare an import preview without changing inventory cardinality.
 *
 * Every parsed source row represents one physical item the user owns. Duplicate
 * looking releases, box sets, and slash-separated multi-film packages must stay
 * as distinct rows; their component details belong in metadata, not as replacement
 * inventory records.
 */
export function prepareImportItemsOneToOne(
  rawItems: Record<string, string>[],
  mediaType: MediaTab,
): Record<string, unknown>[] {
  const items = rawItems.map((row) => mapClzRow(row, mediaType));

  if (mediaType === "cds") {
    for (const item of items) {
      const meta = item.metadata || {};
      if (item._artist) {
        meta.artist = item._artist;
        delete item._artist;
      }
      if (meta.tracks) {
        meta.track_count = meta.tracks;
        delete meta.tracks;
      }
      if (meta.length) {
        meta.total_length = meta.length;
        delete meta.length;
      }
      item.metadata = meta;
    }
  }

  if (mediaType === "games") {
    for (const item of items) {
      const meta = item.metadata || {};
      if (meta.platform) {
        meta.platforms = [meta.platform];
        delete meta.platform;
      }
      item.metadata = meta;
    }
  }

  return items.map((item, index) => {
    const sourceRow = index + 2;
    const next = {
      ...item,
      _previewId: `${index}-${item.barcode || item.title || "item"}`,
      _sourceRow: sourceRow,
    };
    delete next._rowFormats;
    delete next._quantity;
    delete next._artist;
    delete next._gamePlatform;
    return next;
  });
}
