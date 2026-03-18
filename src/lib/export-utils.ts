import { DbMediaItem } from "@/hooks/useMediaItems";

export function exportAsCSV(items: DbMediaItem[], filename = "discstacked-collection.csv") {
  const headers = ["Title", "Year", "Format", "Formats", "Genre", "Rating", "Media Type", "In Plex", "Digital Copy", "Wishlist", "Want to Watch", "Notes", "Barcode"];
  const rows = items.map((item) => [
    item.title,
    item.year ?? "",
    item.format ?? "",
    (item as any).formats?.join("; ") ?? "",
    item.genre ?? "",
    item.rating ?? "",
    item.media_type,
    item.in_plex ? "Yes" : "No",
    item.digital_copy ? "Yes" : "No",
    item.wishlist ? "Yes" : "No",
    item.want_to_watch ? "Yes" : "No",
    item.notes ?? "",
    (item as any).barcode ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  downloadFile(csv, filename, "text/csv");
}

export function exportAsJSON(items: DbMediaItem[], filename = "discstacked-collection.json") {
  const json = JSON.stringify(items, null, 2);
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
