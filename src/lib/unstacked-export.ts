import { DbMediaItem } from "@/hooks/useMediaItems";

/**
 * Export items in a format compatible with Unstacked's import system.
 * Columns match Unstacked's COLUMN_MAP for auto-mapping.
 */

const UNSTACKED_HEADERS = [
  "title", "category", "yearPublished", "quantity", "conditionText",
  "privateComment", "pricePaid", "currency", "status", "tags",
];

function itemsToUnstackedRows(items: DbMediaItem[]): Record<string, string>[] {
  return items.map((item) => {
    const meta = (item.metadata as Record<string, any>) || {};
    const formats = (item as any).formats as string[] | null;
    const tags: string[] = [];
    if (formats && formats.length > 0) tags.push(...formats);
    if (item.genre) tags.push(item.genre);
    if (meta.artist) tags.push(meta.artist);
    if (meta.developer) tags.push(meta.developer);

    return {
      title: item.title,
      category: mapMediaTypeToCategory(item.media_type),
      yearPublished: item.year ? String(item.year) : "",
      quantity: String((item as any).total_copies || 1),
      conditionText: "",
      privateComment: item.notes || "",
      pricePaid: "",
      currency: "USD",
      status: item.wishlist ? "ForTrade" : "Own",
      tags: tags.join(", "),
    };
  });
}

function mapMediaTypeToCategory(mediaType: string): string {
  switch (mediaType) {
    case "movies":
    case "music-films":
      return "Movie";
    case "cds":
      return "Music";
    case "games":
      return "VideoGame";
    default:
      return "Other";
  }
}

export function exportForUnstackedCSV(items: DbMediaItem[], filename = "discstacked-for-unstacked.csv") {
  const rows = itemsToUnstackedRows(items);
  const headers = UNSTACKED_HEADERS;
  const csvRows = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => `"${String(row[h] || "").replace(/"/g, '""')}"`).join(",")
    ),
  ];
  const csv = csvRows.join("\n");
  downloadFile(csv, filename, "text/csv");
}

export function exportForUnstackedJSON(items: DbMediaItem[], filename = "discstacked-for-unstacked.json") {
  const rows = itemsToUnstackedRows(items);
  const json = JSON.stringify(rows, null, 2);
  downloadFile(json, filename, "application/json");
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
