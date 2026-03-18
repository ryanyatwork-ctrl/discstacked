import { MediaTab } from "@/lib/types";

export const TAB_LABELS: Record<MediaTab, string> = {
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

const BOX_SET_KEYWORDS = ["trilogy", "collection", "complete", "pack", "set", "bundle", "quadrilogy", "anthology", "saga"];

const ALIEN_TITLES = ["alien", "aliens", "alien3", "alien 3", "alien resurrection", "alien³"];
const ALIEN_EDITIONS = ["special edition", "collector's edition", "collectors edition"];

/** Detect ALL physical formats from a string (edition, audio tracks, format column) */
export function detectFormats(value: string): string[] {
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
export function cleanString(s: string): string {
  return s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

/** Normalize a title for grouping: lowercase, strip punctuation, collapse whitespace */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mapClzRow(raw: Record<string, string>) {
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
      if (metaKey === "audio_tracks") {
        detectedFormats.push(...detectFormats(value));
      }
      if (metaKey === "quantity") {
        const q = parseInt(value, 10);
        if (!isNaN(q) && q > 0) mapped._quantity = q;
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

  // Deduplicate detected formats
  const uniqueFormats = [...new Set(detectedFormats)];

  // Alien format force: if title contains "Alien" and edition is special/collector's, assume Blu-ray
  const title = (mapped.title || "").toLowerCase();
  const edition = (metadata["edition"] || "").toLowerCase();
  if (
    ALIEN_TITLES.some(at => title === at || title.startsWith(at + " ")) &&
    ALIEN_EDITIONS.some(ae => edition.includes(ae)) &&
    !uniqueFormats.includes("DVD") &&
    !uniqueFormats.includes("Blu-ray")
  ) {
    uniqueFormats.push("Blu-ray");
  }

  // Use all detected formats, default to DVD only if nothing detected
  mapped.format = uniqueFormats[0] || "DVD";
  mapped._rowFormats = uniqueFormats.length > 0 ? uniqueFormats : ["DVD"];

  if (Object.keys(metadata).length > 0) {
    mapped.metadata = metadata;
  }

  return mapped;
}

/**
 * Merge duplicate titles: combine formats into a formats[] array.
 */
export function mergeDuplicates(items: Record<string, any>[]): Record<string, any>[] {
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
      if ((item.title || "").length > (existing.title || "").length) {
        existing.title = item.title;
      }
    } else {
      const { _rowFormats, ...rest } = item;
      map.set(key, { ...rest, formats: [...new Set(rowFormats)], _totalQty: rowQty });
    }
  }

  return Array.from(map.values()).map(({ _totalQty, _quantity, ...item }) => {
    if (_totalQty && _totalQty > 1) {
      item.metadata = { ...(item.metadata || {}), total_copies: String(_totalQty) };
    }
    return item;
  });
}

/**
 * Check if a title is a box set based on keywords or disc count.
 */
function isBoxSet(item: Record<string, any>): boolean {
  const title = (item.title || "").toLowerCase();
  if (BOX_SET_KEYWORDS.some(kw => title.includes(kw))) return true;
  const discCount = parseInt(item.metadata?.disc_count || "0", 10);
  if (discCount > 2) return true;
  return false;
}

/**
 * Detect box sets and expand:
 * 1. Titles with " / " → split into individual movie records
 * 2. Titles with Trilogy/Collection keywords → substring match against other titles
 * 3. Each individual movie gets the box set format added + a box_set metadata entry
 * 4. The box set entry itself is preserved with a contents[] in metadata
 */
export function expandBoxSets(items: Record<string, any>[]): Record<string, any>[] {
  // Build a lookup of normalized title → item for existing individual movies
  const titleMap = new Map<string, Record<string, any>>();
  for (const item of items) {
    titleMap.set(normalizeTitle(item.title || ""), item);
  }

  const toAdd: Record<string, any>[] = [];

  for (const item of items) {
    const title: string = item.title || "";
    const setFormat = item.formats?.[0] || item.format || "DVD";
    const setBarcode = item.metadata?.barcode || item.barcode || null;

    // --- Strategy 1: Slash-separated multi-movie titles ---
    if (title.includes(" / ")) {
      let moviesPart = title;
      const colonIdx = title.indexOf(": ");
      if (colonIdx > -1 && title.indexOf(" / ", colonIdx) > -1) {
        moviesPart = title.slice(colonIdx + 2);
      }

      const movieNames = moviesPart.split(" / ").map(s => s.trim()).filter(Boolean);
      if (movieNames.length >= 2) {
        // Store contents on the set entry
        item.metadata = {
          ...(item.metadata || {}),
          is_box_set: "true",
          contents: JSON.stringify(movieNames),
        };

        for (const name of movieNames) {
          linkOrCreateIndividual(name, item, titleMap, toAdd);
        }
        continue; // Don't also run keyword matching on this item
      }
    }

    // --- Strategy 2: Keyword-based box set detection + substring matching ---
    if (isBoxSet(item)) {
      const normSetTitle = normalizeTitle(title);
      const matchedContents: string[] = [];

      // Try to find individual movies whose normalized title is a substring of the set title,
      // or whose normalized title starts with a significant prefix of the set title
      for (const [normKey, existingItem] of titleMap.entries()) {
        if (normKey === normSetTitle) continue; // skip self
        if (normKey.length < 3) continue; // skip very short titles

        // Check if the individual movie's title appears within the set title
        if (normSetTitle.includes(normKey)) {
          matchedContents.push(existingItem.title);
          addBoxSetSource(existingItem, item);
        }
        // Check if the set title starts with the same base as the individual movie
        // e.g., "back to the future" matches "back to the future the complete trilogy"
        else {
          const setWords = normSetTitle.split(" ");
          const movieWords = normKey.split(" ");
          // If the movie title is at least 2 words and the set title starts with those words
          if (movieWords.length >= 2) {
            const moviePrefix = movieWords.join(" ");
            if (normSetTitle.startsWith(moviePrefix) || normSetTitle.includes(moviePrefix)) {
              matchedContents.push(existingItem.title);
              addBoxSetSource(existingItem, item);
            }
          }
        }
      }

      if (matchedContents.length > 0) {
        item.metadata = {
          ...(item.metadata || {}),
          is_box_set: "true",
          contents: JSON.stringify(matchedContents),
        };
      }
    }
  }

  return [...items, ...toAdd];
}

/** Link an individual movie to its parent box set, or create a new entry */
function linkOrCreateIndividual(
  movieName: string,
  setItem: Record<string, any>,
  titleMap: Map<string, Record<string, any>>,
  toAdd: Record<string, any>[],
) {
  const normKey = normalizeTitle(movieName);
  const setFormat = setItem.formats?.[0] || setItem.format || "DVD";

  if (titleMap.has(normKey)) {
    const existing = titleMap.get(normKey)!;
    addBoxSetSource(existing, setItem);
  } else {
    const newItem: Record<string, any> = {
      title: movieName,
      format: setFormat,
      formats: [setFormat],
      year: setItem.year,
      metadata: {
        box_sets: JSON.stringify([{
          title: setItem.title,
          format: setFormat,
        }]),
      },
    };
    titleMap.set(normKey, newItem);
    toAdd.push(newItem);
  }
}

/** Add box set source info to an existing individual movie's metadata */
function addBoxSetSource(movie: Record<string, any>, setItem: Record<string, any>) {
  const setFormat = setItem.formats?.[0] || setItem.format || "DVD";

  // Add the set's format to the movie's formats if not already there
  if (!movie.formats?.includes(setFormat)) {
    movie.formats = [...(movie.formats || []), setFormat];
  }

  // Track which box sets this movie belongs to
  const existingSets: { title: string; format: string }[] = (() => {
    try {
      return JSON.parse(movie.metadata?.box_sets || "[]");
    } catch {
      return [];
    }
  })();

  const alreadyLinked = existingSets.some(s => normalizeTitle(s.title) === normalizeTitle(setItem.title));
  if (!alreadyLinked) {
    existingSets.push({ title: setItem.title, format: setFormat });
  }

  movie.metadata = {
    ...(movie.metadata || {}),
    box_sets: JSON.stringify(existingSets),
  };
}

/** RFC 4180-compliant CSV parser */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];

  const headers = rows[0].map((h) => h.trim().replace(/^\uFEFF/, ""));
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
        i++;
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
        i++;
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

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
