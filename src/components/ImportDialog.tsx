import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useImportItems } from "@/hooks/useMediaItems";
import { MediaTab } from "@/lib/types";
import { toast } from "@/hooks/use-toast";

interface ImportDialogProps {
  activeTab: MediaTab;
}

const TAB_LABELS: Record<MediaTab, string> = {
  movies: "Movies",
  "music-films": "Music Films",
  cds: "CDs",
  books: "Books",
  games: "Games",
};

// Maps CLZ / common CSV headers → our DB columns
const COLUMN_MAP: Record<string, string> = {
  title: "title",
  name: "title",
  "movie title": "title",
  "album title": "title",
  "book title": "title",
  "game title": "title",
  year: "year",
  "movie release year": "year",
  "release year": "year",
  format: "format",
  edition: "edition",
  genre: "genre",
  genres: "genre",
  rating: "rating",
  "my rating": "rating",
  notes: "notes",
  barcode: "_barcode",
  "running time": "_running_time",
  "no. of discs/tapes": "_disc_count",
  "audio tracks": "_audio_tracks",
  quantity: "_quantity",
  qty: "_quantity",
  subtitles: "_subtitles",
};

/** Detect ALL physical formats from a string (edition, audio tracks, format column) */
function detectFormats(value: string): string[] {
  const v = value.toLowerCase();
  const found: string[] = [];
  if (v.includes("4k") || v.includes("uhd") || v.includes("atmos")) {
    found.push("4K");
  }
  if (
    v.includes("blu-ray") || v.includes("blu ray") || v.includes("bluray") ||
    v.includes("dts-hd") || v.includes("truehd") || v.includes("true hd")
  ) {
    found.push("Blu-ray");
  }
  if (v.includes("dvd")) {
    found.push("DVD");
  }
  return found;
}

/** Strip escaped characters like \' from strings */
function cleanString(s: string): string {
  return s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

function mapClzRow(raw: Record<string, string>) {
  const mapped: Record<string, any> = {};
  const metadata: Record<string, string> = {};
  const detectedFormats: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    if (!value) continue;
    const normalised = key.toLowerCase().trim();
    const dbCol = COLUMN_MAP[normalised];

    if (!dbCol) {
      metadata[normalised] = cleanString(value);
    } else if (dbCol.startsWith("_")) {
      const metaKey = dbCol.slice(1);
      metadata[metaKey] = cleanString(value);
      // Check audio_tracks for format hints
      if (metaKey === "audio_tracks") {
        detectedFormats.push(...detectFormats(value));
      }
    } else if (dbCol === "edition") {
      metadata["edition"] = cleanString(value);
      detectedFormats.push(...detectFormats(value));
    } else if (dbCol === "year") {
      const parsed = parseInt(value, 10);
      if (!isNaN(parsed)) mapped.year = parsed;
    } else if (dbCol === "rating") {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) mapped.rating = parsed;
    } else if (dbCol === "format") {
      const fmts = detectFormats(value);
      if (fmts.length > 0) {
        detectedFormats.push(...fmts);
      } else {
        detectedFormats.push(cleanString(value));
      }
    } else if (dbCol === "title") {
      mapped[dbCol] = cleanString(value);
    } else {
      mapped[dbCol] = cleanString(value);
    }
  }

  // Deduplicate detected formats, default to DVD
  const uniqueFormats = [...new Set(detectedFormats)];
  mapped.format = uniqueFormats[0] || "DVD";
  mapped._rowFormats = uniqueFormats.length > 0 ? uniqueFormats : ["DVD"];

  if (Object.keys(metadata).length > 0) {
    mapped.metadata = metadata;
  }

  return mapped;
}

export function ImportDialog({ activeTab }: ImportDialogProps) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportItems();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let rawItems: Record<string, string>[];

      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        rawItems = Array.isArray(parsed) ? parsed : [parsed];
      } else if (file.name.endsWith(".csv")) {
        rawItems = parseCsv(text);
      } else {
        toast({ title: "Invalid file", description: "Please upload a .csv or .json file.", variant: "destructive" });
        return;
      }

      if (rawItems.length === 0) {
        toast({ title: "Empty file", description: "No items found in the file.", variant: "destructive" });
        return;
      }

      // Map CLZ columns to our schema
      const items = rawItems.map(mapClzRow);

      // Merge duplicates by title: combine formats into array
      const merged = mergeDuplicates(items);

      // Expand box sets: keep set entry + add format to individual movies
      const expanded = expandBoxSets(merged);

      await importMutation.mutateAsync({
        items: expanded,
        mediaType: activeTab,
        replace: true,
      });

      toast({ title: "Import complete", description: `${expanded.length} items imported (${items.length} rows merged) to ${TAB_LABELS[activeTab]}.` });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Upload className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Import to {TAB_LABELS[activeTab]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Upload a <strong>.csv</strong> or <strong>.json</strong> file. This will <strong>replace</strong> all existing items in {TAB_LABELS[activeTab]}.
          </p>
          <p className="text-xs text-muted-foreground">
            Supports <code className="text-accent">CLZ</code> exports and standard CSV files. Extra columns are saved automatically.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
            onChange={handleFile}
            className="hidden"
          />
          <Button
            onClick={() => fileRef.current?.click()}
            disabled={importMutation.isPending}
            className="w-full"
          >
            {importMutation.isPending ? "Importing..." : "Choose File"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** RFC 4180-compliant CSV parser that handles quoted fields with commas, newlines, and escaped quotes */
function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().replace(/^\uFEFF/, "")); // strip BOM
  return rows.slice(1).map((values) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = values[i]?.trim();
      if (v) obj[h] = v;
    });
    return obj;
  });
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\r" && next === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++; // skip \n
      } else if (ch === "\n") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }

  // Last field/row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/**
 * Merge duplicate titles: combine formats into a formats[] array.
 */
/** Normalize a title for grouping: lowercase, strip punctuation, collapse whitespace */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")  // strip colons, dashes, apostrophes, etc.
    .replace(/\s+/g, " ")
    .trim();
}

function mergeDuplicates(items: Record<string, any>[]): Record<string, any>[] {
  const map = new Map<string, Record<string, any>>();

  for (const item of items) {
    const normTitle = normalizeTitle(item.title || "");
    if (!normTitle) continue;

    const yearKey = item.year ? String(item.year) : "?";
    const key = `${normTitle}::${yearKey}`;

    const rowFormats: string[] = item._rowFormats || [item.format || "DVD"];
    const rowQty = item._quantity || 1;

    if (map.has(key)) {
      const existing = map.get(key)!;
      for (const fmt of rowFormats) {
        if (!existing.formats.includes(fmt)) {
          existing.formats.push(fmt);
        }
      }
      existing._totalQty = (existing._totalQty || 1) + rowQty;
      if (!existing.rating && item.rating) existing.rating = item.rating;
      if (!existing.genre && item.genre) existing.genre = item.genre;
      // Keep the longer/better title (with proper punctuation)
      if ((item.title || "").length > (existing.title || "").length) {
        existing.title = item.title;
      }
    } else {
      const { _rowFormats, ...rest } = item;
      map.set(key, { ...rest, formats: [...new Set(rowFormats)], _totalQty: rowQty });
    }
  }

  // Store total quantity in metadata, then clean up temp field
  return Array.from(map.values()).map(({ _totalQty, _quantity, ...item }) => {
    if (_totalQty && _totalQty > 1) {
      item.metadata = { ...(item.metadata || {}), total_copies: String(_totalQty) };
    }
    return item;
  });
}

/**
 * Detect box sets (titles with " / ") and expand:
 * Keep the set entry AND add its format to each individual movie.
 */
function expandBoxSets(items: Record<string, any>[]): Record<string, any>[] {
  const titleMap = new Map<string, Record<string, any>>();
  for (const item of items) {
    titleMap.set(normalizeTitle(item.title || ""), item);
  }

  const toAdd: Record<string, any>[] = [];

  for (const item of items) {
    const title: string = item.title || "";
    if (!title.includes(" / ")) continue;

    let moviesPart = title;
    const colonIdx = title.indexOf(": ");
    if (colonIdx > -1 && title.indexOf(" / ", colonIdx) > -1) {
      moviesPart = title.slice(colonIdx + 2);
    }

    const movieNames = moviesPart.split(" / ").map(s => s.trim()).filter(Boolean);
    if (movieNames.length < 2) continue;

    const setFormat = item.formats?.[0] || item.format || "DVD";
    for (const name of movieNames) {
      const key = normalizeTitle(name);
      if (titleMap.has(key)) {
        const existing = titleMap.get(key)!;
        if (!existing.formats.includes(setFormat)) {
          existing.formats.push(setFormat);
        }
        existing.metadata = { ...(existing.metadata || {}), box_set: item.title };
      } else {
        const newItem = {
          title: name,
          format: setFormat,
          formats: [setFormat],
          year: item.year,
          metadata: { box_set: item.title },
        };
        titleMap.set(key, newItem);
        toAdd.push(newItem);
      }
    }
  }

  return [...items, ...toAdd];
}
