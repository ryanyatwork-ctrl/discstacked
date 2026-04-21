import { MediaTab } from "@/lib/types";

export const TAB_LABELS: Record<string, string> = {
  movies: "Movies",
  "music-films": "Music Media",
  cds: "CDs",
  games: "Games",
};

// Maps CLZ / Blu-ray.com / common CSV headers → our DB columns
const COLUMN_MAP: Record<string, string> = {
  title: "title",
  name: "title",
  "movie title": "title",
  movie: "title",
  release: "title",
  "release title": "title",
  "original title": "title",
  "album title": "title",
  "book title": "title",
  "game title": "title",
  year: "year",
  "movie release year": "year",
  "release year": "year",
  released: "year",
  format: "format",
  media: "format",
  "video format": "format",
  edition: "edition",
  version: "edition",
  genre: "genre",
  genres: "genre",
  rating: "rating",
  "my rating": "rating",
  notes: "notes",
  barcode: "_barcode",
  upc: "_barcode",
  ean: "_barcode",
  "upc/ean": "_barcode",
  "ean/upc": "_barcode",
  "running time": "_running_time",
  runtime: "_running_time",
  "no. of discs/tapes": "_disc_count",
  discs: "_disc_count",
  "disc count": "_disc_count",
  "audio tracks": "_audio_tracks",
  quantity: "_quantity",
  qty: "_quantity",
  subtitles: "_subtitles",
  director: "_director",
  studio: "_studio",
  studios: "_studio",
  country: "_country",
  countries: "_country",
  // CLZ Music Collector columns
  artist: "_artist",
  label: "_label",
  tracks: "_tracks",
  length: "_length",
  // CLZ Games columns
  platform: "_platform",
  platforms: "_platform",
  developer: "_developer",
  publisher: "_publisher",
};

const BOX_SET_KEYWORDS = ["trilogy", "collection", "complete", "pack", "set", "bundle", "quadrilogy", "anthology", "saga"];

const ALIEN_TITLES = ["alien", "aliens", "alien3", "alien 3", "alien resurrection", "alien³"];
const ALIEN_EDITIONS = ["special edition", "collector's edition", "collectors edition"];

/** Detect ALL physical formats from a string (edition, audio tracks, format column) */
export function detectFormats(value: string): string[] {
  const v = value.toLowerCase();
  const found: string[] = [];
  if (v.includes("4k") || v.includes("ultra hd") || v.includes("uhd") || v.includes("atmos")) {
    found.push("4K");
  }
  if (
    v.includes("blu-ray") || v.includes("blu ray") || v.includes("bluray") ||
    v.includes("bd-25") || v.includes("bd-50") || v.includes("bd-66") || v.includes("bd-100") ||
    v.includes("dts-hd") || v.includes("truehd") || v.includes("true hd")
  ) {
    found.push("Blu-ray");
  }
  if (v.includes("3d")) {
    found.push("3D");
  }
  if (v.includes("dvd")) {
    found.push("DVD");
  }
  if (
    v.includes("digital") ||
    v.includes("streaming") ||
    v.includes("movies anywhere") ||
    v.includes("digital copy") ||
    v.includes("digital code")
  ) {
    found.push("Digital");
  }
  if (v.includes("ultraviolet")) {
    found.push("UltraViolet");
  }
  // Music formats
  if (v.includes("cd") || v.includes("compact disc")) {
    found.push("CD");
  }
  if (v.includes("vinyl") || v.includes("lp") || v.includes("12\"") || v.includes("7\"")) {
    found.push("Vinyl");
  }
  if (v.includes("cassette") || v.includes("tape")) {
    found.push("Cassette");
  }
  if (v.includes("promo")) {
    if (!found.includes("CD")) found.push("CD");
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

export function mapClzRow(raw: Record<string, string>, mediaType?: string) {
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
      if (metaKey === "barcode") {
        mapped.barcode = cleanString(value);
      }
      if (metaKey === "audio_tracks") {
        detectedFormats.push(...detectFormats(value));
      }
      if (metaKey === "quantity") {
        const q = parseInt(value, 10);
        if (!isNaN(q) && q > 0) mapped._quantity = q;
      }
      // Promote artist to top-level for CD imports
      if (metaKey === "artist") {
        mapped._artist = cleanString(value);
      }
      // For games, platform becomes the format
      if (metaKey === "platform" && mediaType === "games") {
        const platform = cleanString(value);
        mapped._gamePlatform = platform;
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

  // For games, use platform as the format instead of media format detection
  if (mediaType === "games" && mapped._gamePlatform) {
    const platform = mapped._gamePlatform;
    delete mapped._gamePlatform;
    mapped.format = platform;
    mapped._rowFormats = [platform];
  } else {
    // Deduplicate detected formats
    const uniqueFormats = [...new Set(detectedFormats)];

    // Alien format force
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

    mapped.format = uniqueFormats[0] || "DVD";
    mapped._rowFormats = uniqueFormats.length > 0 ? uniqueFormats : ["DVD"];
  }

  if (Object.keys(metadata).length > 0) {
    if (metadata.running_time) {
      const parsedRuntime = parseInt(metadata.running_time, 10);
      if (!isNaN(parsedRuntime)) {
        (metadata as any).runtime = parsedRuntime;
      }
    }

    if (metadata.director) {
      const directors = metadata.director
        .split(";")
        .map((entry) => cleanString(entry).trim())
        .filter(Boolean);

      if (directors.length > 0) {
        (metadata as any).crew = {
          ...((metadata as any).crew || {}),
          director: directors,
        };
      }
    }

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
    const barcodeKey = item.barcode ? `barcode::${String(item.barcode).trim()}` : null;
    const key = barcodeKey || `${normTitle}::${yearKey}`;

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
  // Build a lookup of normalized title+year → item for existing individual movies
  const titleMap = new Map<string, Record<string, any>>();
  for (const item of items) {
    const key = normalizeTitle(item.title || "") + "::" + (item.year || "?");
    titleMap.set(key, item);
  }
  // Also build a title-only map for fallback matching (box set contents often lack years)
  const titleOnlyMap = new Map<string, Record<string, any>[]>();
  for (const item of items) {
    const normT = normalizeTitle(item.title || "");
    if (!titleOnlyMap.has(normT)) titleOnlyMap.set(normT, []);
    titleOnlyMap.get(normT)!.push(item);
  }

  const toAdd: Record<string, any>[] = [];
  const boxSetIndices = new Set<number>(); // Track which items ARE box sets (to hide them)

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const title: string = item.title || "";

    // --- Strategy 1: Slash-separated multi-movie titles ---
    // Handle both " / " and "/ " separators
    if (title.includes(" / ") || title.includes("/ ")) {
      let moviesPart = title;
      const colonIdx = title.indexOf(": ");
      if (colonIdx > -1 && (title.indexOf(" / ", colonIdx) > -1 || title.indexOf("/ ", colonIdx) > -1)) {
        moviesPart = title.slice(colonIdx + 2);
      }

      const movieNames = moviesPart.split(/\s*\/\s*/).map(s => s.trim()).filter(Boolean);
      if (movieNames.length >= 2) {
        // Mark this box set for hiding
        boxSetIndices.add(idx);

        for (const name of movieNames) {
          linkOrCreateIndividual(name, item, titleMap, titleOnlyMap, toAdd);
        }
        continue;
      }
    }

    // --- Strategy 2: Keyword-based box set detection + substring matching ---
    if (isBoxSet(item)) {
      const normSetTitle = normalizeTitle(title);
      const matchedContents: string[] = [];

      for (const [normTitleOnly, candidates] of titleOnlyMap.entries()) {
        if (normTitleOnly === normSetTitle) continue;
        if (normTitleOnly.length < 3) continue;

        for (const existingItem of candidates) {
          // Skip if the candidate is clearly a different movie (colon subtitle + different year)
          if (existingItem.year && item.year && existingItem.year !== item.year) {
            const baseNorm = normalizeTitle(existingItem.title || "");
            if (
              normSetTitle.startsWith(baseNorm) &&
              !BOX_SET_KEYWORDS.some(kw => normSetTitle.includes(kw))
            ) {
              continue;
            }
          }

          if (normSetTitle.includes(normTitleOnly)) {
            matchedContents.push(existingItem.title);
            addBoxSetSource(existingItem, item);
          } else {
            const movieWords = normTitleOnly.split(" ");
            if (movieWords.length >= 2) {
              const moviePrefix = movieWords.join(" ");
              if (normSetTitle.startsWith(moviePrefix) || normSetTitle.includes(moviePrefix)) {
                matchedContents.push(existingItem.title);
                addBoxSetSource(existingItem, item);
              }
            }
          }
        }
      }

      // If we matched contents, this is a confirmed box set → hide it
      if (matchedContents.length > 0) {
        boxSetIndices.add(idx);
      }
    }
  }

  // Filter out box set entries, keep only individual movies
  const filtered = items.filter((_, idx) => !boxSetIndices.has(idx));

  return [...filtered, ...toAdd];
}

/** Link an individual movie to its parent box set, or create a new entry */
function linkOrCreateIndividual(
  movieName: string,
  setItem: Record<string, any>,
  titleMap: Map<string, Record<string, any>>,
  titleOnlyMap: Map<string, Record<string, any>[]>,
  toAdd: Record<string, any>[],
) {
  const normKey = normalizeTitle(movieName);
  const setFormat = setItem.formats?.[0] || setItem.format || "DVD";

  // Try to find an existing entry by title (any year)
  const candidates = titleOnlyMap.get(normKey);
  if (candidates && candidates.length > 0) {
    // Link to the first matching candidate
    addBoxSetSource(candidates[0], setItem);
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
    const yearKey = newItem.year || "?";
    titleMap.set(normKey + "::" + yearKey, newItem);
    if (!titleOnlyMap.has(normKey)) titleOnlyMap.set(normKey, []);
    titleOnlyMap.get(normKey)!.push(newItem);
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
  const rows = parseDelimitedRows(text, detectDelimiter(text));
  if (rows.length === 0) return [];

  const firstRow = rows[0].map((h) => h.trim().replace(/^\uFEFF/, ""));
  const hasHeaderRow = isLikelyHeaderRow(firstRow);
  const headers = hasHeaderRow ? firstRow : inferHeaders(firstRow.length);
  const dataRows = hasHeaderRow ? rows.slice(1) : rows;

  return dataRows.map((values) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = values[i]?.trim();
      if (v) obj[h] = v;
    });
    return obj;
  });
}

function detectDelimiter(text: string): "," | "\t" | ";" {
  const sample = text
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0) || "";

  const commaCount = (sample.match(/,/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  const semicolonCount = (sample.match(/;/g) || []).length;

  if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount > 0) return "\t";
  if (semicolonCount > commaCount && semicolonCount > 0) return ";";
  return ",";
}

function parseDelimitedRows(text: string, delimiter: "," | "\t" | ";"): string[][] {
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
      } else if (ch === delimiter) {
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

function isLikelyHeaderRow(values: string[]) {
  const normalized = values.map((value) => value.toLowerCase().trim());
  const knownCount = normalized.filter((value) => Boolean(COLUMN_MAP[value])).length;
  return knownCount >= Math.max(1, Math.ceil(values.length / 3));
}

function inferHeaders(columnCount: number): string[] {
  if (columnCount >= 4) return ["Title", "Format", "Barcode", "Year"];
  if (columnCount === 3) return ["Title", "Format", "Barcode"];
  if (columnCount === 2) return ["Title", "Format"];
  if (columnCount === 1) return ["Title"];

  return Array.from({ length: columnCount }, (_, index) => `Column ${index + 1}`);
}
