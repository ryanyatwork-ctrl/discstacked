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
const CARDINAL_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};
// Parse the token following "season"/"series": "2", "two", "3rd".
function seasonWordToNumber(token: string): number | null {
  const t = token.toLowerCase().replace(/(?:st|nd|rd|th)$/, "");
  if (/^\d+$/.test(t)) return parseInt(t, 10) || null;
  return CARDINAL_WORDS[t] ?? ORDINAL_WORDS[token.toLowerCase()] ?? null;
}

const STUDIO_SUFFIX_PATTERN = /\b(?:cineverse|mill\s*creek(?:\s*entertainment)?|entertainment\s*one|eone|studio\s*canal|studiocanal|warner\s*bros\.?|warner\s*brothers|walt\s*disney|universal|paramount|sony\s*pictures?|lions\s*gate|lionsgate|20th\s*century\s*fox|mgm|columbia|dreamworks|new\s*line|miramax|touchstone|screen\s*media|rlj\s*entertainment|ifc\s*films|shout\s*factory)\b$/i;
const STUDIO_PREFIX_PATTERN = /^(?:cineverse|mill\s*creek(?:\s*entertainment)?|entertainment\s*one|eone|studio\s*canal|studiocanal|warner\s*bros\.?|warner\s*brothers|walt\s*disney|universal|paramount|sony\s*pictures?|lions\s*gate|lionsgate|20th\s*century\s*fox|mgm|columbia|dreamworks|new\s*line|miramax|touchstone|screen\s*media|rlj\s*entertainment|ifc\s*films|shout\s*factory)\b[:\s-]*/i;
const STUDIO_ANYWHERE_PATTERN = /\b(?:cineverse|mill\s*creek(?:\s*entertainment)?|entertainment\s*one|eone|studio\s*canal|studiocanal|warner\s*bros\.?|warner\s*brothers|walt\s*disney|universal|paramount|sony\s*pictures?|lions\s*gate|lionsgate|20th\s*century\s*fox|mgm|columbia|dreamworks|new\s*line|miramax|touchstone|screen\s*media|rlj\s*entertainment|ifc\s*films|shout\s*factory)\b/gi;
const TRAILING_GENRE_PATTERN = /\b(?:action|comedy|drama|horror|thriller|romance|animation|adventure|fantasy|documentary|musical|western|mystery|crime|war|history|family|music)\b\.?$/i;
const GENRE_CHAIN_PATTERN = /\b(?:action|comedy|drama|horror|thriller|romance|animation|adventure|fantasy|documentary|musical|western|mystery|crime|war|history|family|music|science\s*fiction|sci\s*-?fi)\b(?:[\s/&,-]+\b(?:action|comedy|drama|horror|thriller|romance|animation|adventure|fantasy|documentary|musical|western|mystery|crime|war|history|family|music|science\s*fiction|sci\s*-?fi)\b){1,}$/i;
// Strips trailing "...directed by / starring / presented by / feature" noise.
// "feature" is protected when it's part of a "double/triple feature" — that's
// a multi-movie marker, and truncating there ("AVP Double Feature: A / B" ->
// "AVP Double") destroys the movie list before it can be split.
const TRAILING_METADATA_PATTERN = /\b(?:directed\s+by|starring|presented\s+by)\b.*$|(?<!\b(?:double|triple)\s)\bfeature\b.*$/i;
// Keep this intentionally narrow. Broad single-word genre stripping caused
// real titles like "Avengers: Infinity War" and "The Family" to be mangled
// before fuzzy matching.
const GENRE_SUFFIX_PATTERN = /\b(?:sci\s*-?fi|science\s*fiction)\b\.?$/i;
const EDITION_SUFFIX_PATTERN = /\b(?:collector'?s?\s*edition|collector\s*s\s*edition|special\s*edition|limited\s*edition|anniversary\s*edition|ultimate\s*edition|steelbook|combo\s*pack|with\s*digital(?:\s*copy)?|signature\s*collection|diamond\s*edition|masterpiece\s*edition|extended\s*edition|platinum\s*edition)\b$/i;

function restoreTrailingArticleTitle(value: string): string {
  const match = value.match(/^(.+),\s*(the|a|an)$/i);
  if (!match) return value;
  return `${match[2]} ${match[1]}`.replace(/\s+/g, " ").trim();
}

export function normalizeLookupText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    // Rejoin a possessive/contraction "s" that a data source turned into a
    // separate token by replacing the apostrophe with a space. UPCitemdb sends
    // "Child s Play" where TMDB has "Child's Play"; both should normalize to
    // "childs play". Requires a >=2-char lead word to avoid odd merges.
    .replace(/\b([a-z]{2,}) s\b/g, "$1s")
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
    .replace(/^[\w\s&.']+?\s+-\s+/i, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\((?!19\d{2}\)|20\d{2}\))[^)]*\)/g, " ")
    .replace(/\b(?:blu-?ray|dvd|4k|uhd|ultra\s*hd|digital|hd|widescreen|fullscreen|std|ws|dc|bd|bd\s*\+\s*dc|blu\s*ray\s*\+\s*digital\s*copy|unrated|special\s*edition|collector'?s?\s*edition|collector\s*s\s*edition|limited\s*edition|anniversary\s*edition|ultimate\s*edition|steelbook|combo\s*pack|with\s*digital(?:\s*copy)?|includes?\s*digital(?:\s*copy)?|signature\s*collection|diamond\s*edition|masterpiece\s*edition|extended\s*edition|platinum\s*edition)\b/gi, " ")
    .replace(/\b(?:\d+\s*disc(?:s)?|one\s*disc|two\s*disc|three\s*disc|four\s*disc|five\s*disc|six\s*disc|seven\s*disc|eight\s*disc|nine\s*disc|ten\s*disc)\b/gi, " ")
    .replace(/\b(?:season\s*\d+\s*blu\s*ray|season\s*\d+\s*dvd)\b/gi, " ")
    .replace(TRAILING_METADATA_PATTERN, " ")
    .replace(/\s*[,+]\s*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  cleaned = cleaned.replace(GENRE_CHAIN_PATTERN, " ").replace(/\s+/g, " ").trim();

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
    const deStudio = base.replace(STUDIO_ANYWHERE_PATTERN, " ").replace(/\s+/g, " ").trim();
    const withoutLeadingNew = base.replace(/^new\s+/i, "").trim();
    const words = base.split(/\s+/).filter(Boolean);
    const withoutTrailingGenre = words.length > 2
      ? base.replace(TRAILING_GENRE_PATTERN, "").replace(/\s+/g, " ").trim()
      : base;
    const withoutTrailingMetadata = base.replace(TRAILING_METADATA_PATTERN, "").replace(/\s+/g, " ").trim();
    const withoutGenreChain = base.replace(GENRE_CHAIN_PATTERN, "").replace(/\s+/g, " ").trim();

    const colonBase = base.split(/\s*[:|]\s*/)[0]?.trim();
    const dashBase = base.split(/\s[-–]\s/)[0]?.trim();

    if (deStudio && deStudio !== base) addCandidate(deStudio);
    if (withoutLeadingNew && withoutLeadingNew !== base) addCandidate(withoutLeadingNew);
    if (withoutTrailingGenre && withoutTrailingGenre !== base) addCandidate(withoutTrailingGenre);
    if (withoutTrailingMetadata && withoutTrailingMetadata !== base) addCandidate(withoutTrailingMetadata);
    if (withoutGenreChain && withoutGenreChain !== base) addCandidate(withoutGenreChain);
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

  // "Season 2", "Season Two", or British "Series Ten" (a single season \u2014 note
  // "Complete Series" with no number is handled above as a whole-series box).
  // Requires a non-empty show name before the keyword, so a bare movie title
  // like "Series 7" can't be mistaken for a season.
  const numericMatch = title.match(/^(.+?)\s*[:\-\u2013]?\s*(?:the\s+)?(?:complete\s+)?(?:season|series)\s+(\w+)\b/i);
  if (numericMatch) {
    const seasonNum = seasonWordToNumber(numericMatch[2]);
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
  } else if (normalizedTitle.startsWith(normalizedQuery)) {
    score = 82;
  } else if (normalizedQuery.startsWith(normalizedTitle)) {
    // The result title is a prefix of the query. If the query has a colon /
    // dash structure and the title only matches the pre-delimiter segment
    // ("Star Wars" from "Star Wars: Episode VII: The Force Awakens"), the
    // rest of the query is almost certainly the real subtitle, so this is a
    // franchise-base near-miss — score it below the accept threshold.
    const delimiterPrefix = normalizeLookupText((query.split(/[:|–]|\s-\s/)[0] || ""));
    const isFranchiseBaseOnly = Boolean(delimiterPrefix)
      && delimiterPrefix !== normalizedQuery
      && normalizedTitle === delimiterPrefix;
    score = isFranchiseBaseOnly ? 55 : 82;
  } else {
    score = Math.round((coverage * 60) + (precision * 20));
    // Package text often wraps the real title in extra words ("Star Wars:
    // Episode VII: The Force Awakens" vs TMDB's "Star Wars: The Force
    // Awakens"). When every title word is present and most of the query is
    // covered, treat it as a near-match instead of a weak word-soup score.
    if (precision === 1 && coverage >= 0.6) score = Math.max(score, 78);
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

// Score a result found through a derived search candidate (colon-base,
// de-studio, genre-stripped, etc). The candidate is only a search query —
// the result must still be judged against the full cleaned title, otherwise
// a truncated candidate like "Star Wars" (from "Star Wars: Episode VII: The
// Force Awakens") exact-matches the wrong franchise-base movie. Each word the
// candidate drops from the full title costs 18 points, and the full-title
// score acts as the floor.
export function scoreMovieCandidate(
  fullQuery: string,
  candidate: string,
  result: TmdbMovieSearchResult,
  barcodeYear?: number | null,
): number {
  const fullScore = scoreMovieResult(fullQuery, result, barcodeYear);

  const fullWords = new Set(normalizeLookupText(fullQuery).split(" ").filter(Boolean));
  const candidateWords = new Set(normalizeLookupText(candidate).split(" ").filter(Boolean));
  if (candidateWords.size >= fullWords.size) {
    return Math.max(fullScore, scoreMovieResult(candidate, result, barcodeYear));
  }

  const droppedWords = fullWords.size - candidateWords.size;
  const candidateScore = scoreMovieResult(candidate, result, barcodeYear) - droppedWords * 18;

  return Math.max(fullScore, candidateScore);
}
