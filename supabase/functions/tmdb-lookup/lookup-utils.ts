export interface TmdbMovieSearchResult {
  id: number;
  title?: string;
  release_date?: string;
  popularity?: number;
}

export const MULTI_MOVIE_KEYWORDS = /\b(collection|trilogy|quadrilogy|pentalogy|hexalogy|anthology|box\s*set|boxset|double\s*feature|triple\s*feature|complete\s*saga|pack|[2-9][\s-]?(film|movie)s?)\b/i;
export const TV_KEYWORDS = /\b(complete\s*(series|seasons?)|season[s]?\s*\d+(\s*[-\u2013]\s*\d+)?|the\s+complete\s+\w+\s+season|mini[-\s]?series)\b/i;

const ORDINAL_WORDS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
  thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
  seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
};

const STUDIO_SUFFIX_PATTERN = /\b(?:cineverse|mill\s*creek(?:\s*entertainment)?|entertainment\s*one|eone|studio\s*canal|studiocanal|warner\s*bros\.?|warner\s*brothers|walt\s*disney|universal|paramount|sony\s*pictures?|lionsgate|20th\s*century\s*fox|mgm|columbia|dreamworks|new\s*line|miramax|touchstone|screen\s*media|rlj\s*entertainment|ifc\s*films|shout\s*factory)\b$/i;
const STUDIO_PREFIX_PATTERN = /^(?:cineverse|mill\s*creek(?:\s*entertainment)?|entertainment\s*one|eone|studio\s*canal|studiocanal|warner\s*bros\.?|warner\s*brothers|walt\s*disney|universal|paramount|sony\s*pictures?|lionsgate|20th\s*century\s*fox|mgm|columbia|dreamworks|new\s*line|miramax|touchstone|screen\s*media|rlj\s*entertainment|ifc\s*films|shout\s*factory)\b[:\s-]*/i;
// Keep this intentionally narrow. Broad single-word genre stripping caused
// real titles like "Avengers: Infinity War" and "The Family" to be mangled
// before fuzzy matching.
const GENRE_SUFFIX_PATTERN = /\b(?:sci\s*-?fi|science\s*fiction)\b\.?$/i;
const EDITION_SUFFIX_PATTERN = /\b(?:collector'?s?\s*edition|collector\s*s\s*edition|special\s*edition|limited\s*edition|anniversary\s*edition|ultimate\s*edition|steelbook|combo\s*pack|with\s*digital(?:\s*copy)?)\b$/i;

function restoreTrailingArticleTitle(value: string): string {
  const match = value.match(/^(.+),\s*(the|a|an)$/i);
  if (!match) return value;
  return `${match[2]} ${match[1]}`.replace(/\s+/g, " ").trim();
}

export function normalizeLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractYearFromText(value?: string | null): number | null {
  if (!value) return null;

  const parenthesized = value.match(/[\[(](19\d{2}|20\d{2})[\])]/);
  if (parenthesized) return parseInt(parenthesized[1], 10);

  const trailing = value.match(/(?:^|\s)(19\d{2}|20\d{2})$/);
  if (trailing) return parseInt(trailing[1], 10);

  return null;
}

export function stripTrailingNoise(value: string): string {
  let cleaned = value.replace(/[\[\]{}]/g, " ").replace(/\s+/g, " ").trim();
  let previous = "";

  while (cleaned && cleaned !== previous) {
    previous = cleaned;
    cleaned = cleaned
      .replace(/\s+(?:action|comedy|drama|horror|thriller|romance|sci\s*-?fi|science\s*fiction|animation|adventure|fantasy|documentary|musical|western|mystery|crime|war|history|family|music)\s*(?:and|&)\s*$/i, " ")
      .replace(STUDIO_SUFFIX_PATTERN, " ")
      .replace(GENRE_SUFFIX_PATTERN, " ")
      .replace(EDITION_SUFFIX_PATTERN, " ")
      .replace(/\b(?:and|&)\s*$/i, " ")
      .replace(/[\s.,;:|/+-]+$/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return cleaned;
}

export function cleanProductTitle(raw: string): string {
  const withoutParentheticalYear = raw.replace(/[\[(](19\d{2}|20\d{2})[\])]/g, " ");

  let cleaned = withoutParentheticalYear
    .replace(STUDIO_PREFIX_PATTERN, " ")
    .replace(/^[\w\s&.']+?\s*-\s*/i, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\((?!19\d{2}\)|20\d{2}\))[^)]*\)/g, " ")
    .replace(/\b(?:blu-?ray|dvd|4k|uhd|ultra\s*hd|digital|hd|widescreen|fullscreen|std|ws|dc|bd|bd\s*\+\s*dc|blu\s*ray\s*\+\s*digital\s*copy|unrated|special\s*edition|collector'?s?\s*edition|collector\s*s\s*edition|limited\s*edition|anniversary\s*edition|ultimate\s*edition|steelbook|combo\s*pack|with\s*digital(?:\s*copy)?|includes?\s*digital(?:\s*copy)?)\b/gi, " ")
    .replace(/\b(?:season\s*\d+\s*blu\s*ray|season\s*\d+\s*dvd)\b/gi, " ")
    .replace(/\s*[,+]\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = restoreTrailingArticleTitle(cleaned);
  cleaned = stripTrailingNoise(cleaned);

  return cleaned;
}

export function generateTitleCandidates(rawTitle: string, cleanedTitle = cleanProductTitle(rawTitle)): string[] {
  const candidates = new Set<string>();

  const addCandidate = (value?: string | null) => {
    if (!value) return;

    const candidate = stripTrailingNoise(
      value
        .replace(/[\[(](19\d{2}|20\d{2})[\])]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );

    if (candidate.length >= 2) candidates.add(candidate);
  };

  addCandidate(cleanedTitle);
  addCandidate(rawTitle);

  for (const base of Array.from(candidates)) {
    const colonBase = base.split(/\s*[:|]\s*/)[0]?.trim();
    const dashBase = base.split(/\s[-–]\s/)[0]?.trim();

    if (colonBase && colonBase !== base) addCandidate(colonBase);
    if (dashBase && dashBase !== base) addCandidate(dashBase);
  }

  return Array.from(candidates);
}

export function parseTvIndicator(title: string): {
  kind: "single" | "range" | "complete" | "none";
  seasonNum?: number;
  from?: number;
  to?: number;
  showName?: string;
} {
  const completeSeriesMatch = title.match(/^(.+?)\s*[:\-\u2013]?\s*(?:the\s+)?complete\s+series\b.*$/i);
  if (completeSeriesMatch) {
    return { kind: "complete", showName: completeSeriesMatch[1].trim().replace(/[:\-\u2013\s]+$/g, "").trim() };
  }

  const rangeMatch = title.match(/^(.+?)\s*[:\-\u2013]?\s*seasons?\s*(\d+)\s*[-\u2013]\s*(\d+)\b/i);
  if (rangeMatch) {
    const from = parseInt(rangeMatch[2], 10);
    const to = parseInt(rangeMatch[3], 10);
    if (from && to && to >= from) {
      return { kind: "range", from, to, showName: rangeMatch[1].trim().replace(/[:\-\u2013\s]+$/g, "").trim() };
    }
  }

  const numericMatch = title.match(/^(.+?)\s*[:\-\u2013]?\s*(?:the\s+)?(?:complete\s+)?season\s*(\d+)\b/i);
  if (numericMatch) {
    const seasonNum = parseInt(numericMatch[2], 10);
    if (seasonNum) {
      return { kind: "single", seasonNum, showName: numericMatch[1].trim().replace(/[:\-\u2013\s]+$/g, "").trim() };
    }
  }

  const ordinalMatch = title.match(/^(.+?)\s*[:\-\u2013]\s*(?:the\s+)?(?:complete\s+)?(\w+)\s+season\b/i);
  if (ordinalMatch) {
    const seasonNum = ORDINAL_WORDS[ordinalMatch[2].toLowerCase()];
    if (seasonNum) {
      return { kind: "single", seasonNum, showName: ordinalMatch[1].trim().replace(/[:\-\u2013\s]+$/g, "").trim() };
    }
  }

  const miniSeriesMatch = title.match(/^(.+?)\s*[:\-\u2013]?\s*mini[-\s]?series\b/i);
  if (miniSeriesMatch) {
    return { kind: "complete", showName: miniSeriesMatch[1].trim().replace(/[:\-\u2013\s]+$/g, "").trim() };
  }

  return { kind: "none" };
}

export function splitMultiTitleCandidates(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  if (cleaned.includes("/")) {
    return cleaned.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  }

  const numericSet = cleaned.match(/^(.+?)\s+(\d+)\s*&\s*(\d+)$/i);
  if (numericSet) {
    const base = numericSet[1].trim();
    return [numericSet[2], numericSet[3]].map((n) => `${base} ${n}`);
  }

  return [];
}

export function expandSharedFranchiseTitles(movieTitles: string[]): string[] {
  if (movieTitles.length <= 1) return movieTitles;

  const first = movieTitles[0];
  const franchisePrefixMatch = first.match(/^(.+?)(?::|\s+-\s+|\s+chapter\b|\s+part\b|\s+\d\b)/i);
  const franchisePrefix = franchisePrefixMatch?.[1]?.trim();

  if (!franchisePrefix) return movieTitles;

  if (MULTI_MOVIE_KEYWORDS.test(franchisePrefix)) {
    const colonIndex = first.indexOf(":");
    const stripped = colonIndex !== -1
      ? first.slice(colonIndex + 1).trim()
      : first.replace(franchisePrefix, "").trim();
    return [stripped, ...movieTitles.slice(1)];
  }

  const prefixPattern = new RegExp(`^${franchisePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");

  return movieTitles.map((title, index) => {
    if (index === 0 || prefixPattern.test(title)) return title;
    return `${franchisePrefix} ${title}`.replace(/\s+/g, " ").trim();
  });
}

export function extractCollectionFranchiseName(title: string): string {
  const globalKeywords = new RegExp(MULTI_MOVIE_KEYWORDS.source, "gi");

  return title
    .replace(globalKeywords, " ")
    .replace(/\b(?:chapters?\s*\d+(?:\s*[-\u2013]\s*\d+)?|\d+\s*&\s*\d+|\d+\s*[-\u2013]\s*\d+)\b/gi, " ")
    .replace(/[:,;]+/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function scoreCollectionMatch(query: string, name: string): number {
  const normalizedQuery = normalizeLookupText(query)
    .replace(/\b(?:chapters?|collection|trilogy|quadrilogy|pentalogy|hexalogy|anthology|pack|box\s*set|double\s*feature|triple\s*feature|feature|film|movie|complete|saga|series)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedName = normalizeLookupText(name)
    .replace(/\b(?:collection|series|saga|trilogy|quadrilogy|pentalogy|hexalogy|anthology)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedQuery || !normalizedName) return 0;
  if (normalizedName === normalizedQuery) return 100;
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) return 85;

  const queryWords = new Set(normalizedQuery.split(" ").filter(Boolean));
  const nameWords = new Set(normalizedName.split(" ").filter(Boolean));
  const overlap = Array.from(queryWords).filter((word) => nameWords.has(word)).length;

  return Math.round((overlap / Math.max(queryWords.size, 1)) * 70);
}

function getResultYear(releaseDate?: string): number | null {
  if (!releaseDate || releaseDate.length < 4) return null;
  const year = parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

export function scoreMovieResult(query: string, result: TmdbMovieSearchResult, barcodeYear?: number | null): number {
  const normalizedQuery = normalizeLookupText(query);
  const normalizedTitle = normalizeLookupText(result.title || "");

  if (!normalizedQuery || !normalizedTitle) return Number.NEGATIVE_INFINITY;

  const queryWords = Array.from(new Set(normalizedQuery.split(" ").filter(Boolean)));
  const titleWords = Array.from(new Set(normalizedTitle.split(" ").filter(Boolean)));
  const overlap = queryWords.filter((word) => titleWords.includes(word)).length;
  const coverage = overlap / Math.max(queryWords.length, 1);
  const precision = overlap / Math.max(titleWords.length, 1);

  let score = 0;

  if (normalizedTitle === normalizedQuery) {
    score = 100;
  } else if (normalizedTitle.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedTitle)) {
    score = 82;
  } else {
    score = Math.round((coverage * 60) + (precision * 20));
  }

  if (overlap === 0) score -= 40;

  const resultYear = getResultYear(result.release_date);
  if (barcodeYear && resultYear) {
    const diff = Math.abs(barcodeYear - resultYear);
    if (diff === 0) score += 85;
    else if (diff === 1) score += 65;
    else if (diff <= 3) score += 35;
    else if (diff <= 10) score -= 5;
    else score -= 20;
  } else if (barcodeYear && !resultYear) {
    score -= 10;
  }

  score += Math.min(result.popularity || 0, 30) / 10;

  return score;
}
