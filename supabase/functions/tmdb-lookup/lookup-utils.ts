export interface TmdbMovieSearchResult {
  id: number;
  title?: string;
  release_date?: string;
  popularity?: number;
}

const STUDIO_SUFFIX_PATTERN = /\b(?:cineverse|mill\s*creek(?:\s*entertainment)?|entertainment\s*one|eone|studio\s*canal|studiocanal|warner\s*bros\.?|walt\s*disney|universal|paramount|sony\s*pictures?|lionsgate|20th\s*century\s*fox|mgm|columbia|dreamworks|new\s*line|miramax|touchstone|screen\s*media|rlj\s*entertainment|ifc\s*films|shout\s*factory)\b$/i;
const GENRE_SUFFIX_PATTERN = /\b(?:action|comedy|drama|horror|thriller|romance|sci\s*-?fi|science\s*fiction|animation|adventure|fantasy|documentary|musical|western|mystery|crime|war|history|family|music)\b\.?$/i;
const EDITION_SUFFIX_PATTERN = /\b(?:collector'?s?\s*edition|collector\s*s\s*edition|special\s*edition|limited\s*edition|anniversary\s*edition|ultimate\s*edition|steelbook|combo\s*pack|with\s*digital(?:\s*copy)?)\b$/i;

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
    .replace(/^[\w\s&.']+?\s*-\s*/i, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\((?!19\d{2}\)|20\d{2}\))[^)]*\)/g, " ")
    .replace(/\b(?:blu-?ray|dvd|4k|uhd|ultra\s*hd|digital|hd|widescreen|fullscreen|unrated|special\s*edition|collector'?s?\s*edition|collector\s*s\s*edition|limited\s*edition|anniversary\s*edition|ultimate\s*edition|steelbook|combo\s*pack|with\s*digital(?:\s*copy)?|includes?\s*digital(?:\s*copy)?)\b/gi, " ")
    .replace(/\s*[,+]\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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