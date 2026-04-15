import { supabase } from "@/integrations/supabase/client";
import { MediaTab } from "@/lib/types";

export interface MediaLookupResult {
  id: string;
  title: string;
  year: number | null;
  cover_url: string | null;
  genre: string | null;
  // Movies
  tmdb_id?: number | null;
  runtime?: number | null;
  tagline?: string | null;
  overview?: string | null;
  cast?: any[];
  crew?: any;
  // Books
  author?: string | null;
  page_count?: number | null;
  publisher?: string | null;
  isbn?: string | null;
  description?: string | null;
  categories?: string[];
  // Music
  artist?: string | null;
  label?: string | null;
  tracklist?: { position: string; title: string; duration?: string }[];
  // Games
  platforms?: string[];
  developer?: string | null;
  rating?: number | null;
  // Common
  barcode?: string | null;
  source?: string;
  detected_formats?: string[];
  // Content type
  media_type?: string; // movie | tv | tv_season | box_set
  // TV Season
  tmdb_series_id?: number | null;
  season_number?: number | null;
  // Box Set
  included_titles?: { title: string; year?: number | null; tmdb_id?: number | null }[];
  // Edition / Package
  edition?: {
    barcode_title?: string;
    package_year?: number | null;
    formats?: string[];
  };
}

export interface MultiMovieResult {
  is_multi_movie: true;
  product_title: string;
  barcode_title: string;
  detected_formats: string[];
  collection_name?: string;
  movies: {
    tmdb_id: number | null;
    title: string;
    year: number | null;
    poster_url: string | null;
    overview?: string | null;
  }[];
}

/**
 * Per-source result from the edge function's lookup chain.
 * Status values seen: "HIT", "HIT-movie", "HIT-tv", "HIT-highconf",
 * "MISS", "MISS-lowconf", "MISS-noresults", "ERROR", "FAILED".
 */
export interface LookupDebugEntry {
  source: string;
  status: string;
  raw?: any;
}

export type BarcodeLookupResult = {
  direct?: MediaLookupResult;
  results?: MediaLookupResult[];
  multiMovie?: MultiMovieResult;
  partialTitle?: string;
  partialFormats?: string[];
  /** Per-source hit/miss trail from the edge function. Present on every return. */
  debug?: LookupDebugEntry[];
  /** Human-readable explanation of why the lookup didn't produce a direct match.
   *  Populated on soft-fails (no results, partial match, edge function error). */
  failureReason?: string;
};

/**
 * Build a short human-readable explanation from a debug trail.
 * Prefers the first ERROR entry, falls back to summarizing MISS reasons.
 * Exported for unit testing.
 */
export function buildFailureReason(debug: LookupDebugEntry[] | undefined): string | undefined {
  if (!debug || debug.length === 0) return undefined;
  const firstError = debug.find((d) => d.status === "ERROR");
  if (firstError) {
    return `${firstError.source} errored: ${typeof firstError.raw === "string" ? firstError.raw : "unknown"}`;
  }
  const allFailed = debug[debug.length - 1];
  if (allFailed?.source === "ALL" && allFailed.status === "FAILED") {
    const tried = debug
      .filter((d) => d.source !== "ALL")
      .map((d) => `${d.source}:${d.status}`)
      .join(", ");
    return `No source matched (${tried})`;
  }
  const lowConf = debug.find((d) => d.status === "MISS-lowconf");
  if (lowConf && lowConf.raw?.bestResult) {
    return `TMDB fuzzy match rejected (low confidence). Best guess: "${lowConf.raw.bestResult}"`;
  }
  return undefined;
}

export async function searchMedia(
  activeTab: MediaTab,
  query: string,
  opts?: { year?: number; barcode?: string; searchType?: "movie" | "tv" }
): Promise<MediaLookupResult[]> {
  if (activeTab === "movies" || activeTab === "music-films") return searchTmdb(query, opts);
  if (activeTab === "cds") return searchMusic(query, opts?.barcode);
  if (activeTab === "games") return searchGames(query);
  return [];
}

export async function lookupBarcode(
  activeTab: MediaTab,
  barcode: string
): Promise<BarcodeLookupResult> {
  if (activeTab === "movies" || activeTab === "music-films") {
    let data: any;
    try {
      const resp = await supabase.functions.invoke("tmdb-lookup", {
        body: { barcode },
      });
      if (resp.error) {
        return { failureReason: `Edge function error: ${resp.error.message}` };
      }
      data = resp.data;
    } catch (e: any) {
      return { failureReason: `Edge function unreachable: ${e?.message || String(e)}` };
    }

    const debug: LookupDebugEntry[] | undefined = Array.isArray(data?._debug) ? data._debug : undefined;

    // Multi-movie detection
    if (data?.is_multi_movie && data?.multi_movies?.length > 0) {
      return {
        multiMovie: {
          is_multi_movie: true,
          product_title: data.product_title,
          barcode_title: data.barcode_title,
          detected_formats: data.detected_formats || [],
          collection_name: data.collection_name,
          movies: data.multi_movies,
        },
        debug,
      };
    }

    if (data?.tmdb_id && data?.title) {
      return {
        direct: {
          id: String(data.tmdb_id),
          tmdb_id: data.tmdb_id,
          title: data.title,
          year: data.year || null,
          cover_url: data.poster_url || null,
          genre: data.genre || null,
          runtime: data.runtime,
          tagline: data.tagline,
          overview: data.overview,
          cast: data.cast,
          crew: data.crew,
          detected_formats: data.detected_formats,
          media_type: data.media_type || "movie",
          tmdb_series_id: data.tmdb_series_id || null,
          season_number: data.season_number || null,
          included_titles: data.included_titles || undefined,
          edition: data.barcode_title ? {
            barcode_title: data.barcode_title,
            formats: data.detected_formats || [],
          } : undefined,
        },
        debug,
      };
    }
    if (data?.results?.length > 0) {
      return { results: data.results.map(mapTmdbResult), debug };
    }
    // Barcode not found or partial match — return partial data for soft-fail UX
    if (data?.barcode_not_found || (data?.title && !data?.tmdb_id)) {
      return {
        partialTitle: data.title || "",
        partialFormats: data.detected_formats || [],
        debug,
        failureReason:
          buildFailureReason(debug) ||
          (data?.title
            ? `Title "${data.title}" found but no TMDB match`
            : "No source matched this barcode"),
      };
    }
    return { debug, failureReason: buildFailureReason(debug) || "Unknown lookup failure" };
  }

  if (activeTab === "cds") {
    let data: any;
    try {
      const resp = await supabase.functions.invoke("music-lookup", {
        body: { barcode },
      });
      if (resp.error) {
        return { failureReason: `Edge function error: ${resp.error.message}` };
      }
      data = resp.data;
    } catch (e: any) {
      return { failureReason: `Edge function unreachable: ${e?.message || String(e)}` };
    }
    const debug: LookupDebugEntry[] | undefined = Array.isArray(data?._debug) ? data._debug : undefined;
    if (data?.title) {
      return {
        direct: {
          id: data.barcode || barcode,
          title: data.title,
          year: data.year || null,
          cover_url: data.poster_url || null,
          genre: data.genre || null,
          artist: data.artist,
          label: data.label,
          tracklist: data.tracklist,
          barcode: data.barcode,
        },
        debug,
      };
    }
    if (data?.results?.length > 0) {
      return { results: data.results, debug };
    }
    return { debug, failureReason: buildFailureReason(debug) || "No music-lookup source matched" };
  }

  return { failureReason: `No lookup implemented for tab "${activeTab}"` };
}

// --- Internal search helpers ---

function mapTmdbResult(r: any): MediaLookupResult {
  return {
    id: `tmdb-${r.tmdb_id}`,
    tmdb_id: r.tmdb_id,
    title: r.title,
    year: r.year || null,
    cover_url: r.poster_url || null,
    genre: r.genre || null,
    runtime: r.runtime,
    tagline: r.tagline,
    overview: r.overview,
    cast: r.cast,
    crew: r.crew,
    source: "tmdb",
    media_type: r.media_type || "movie",
    tmdb_series_id: r.tmdb_series_id || null,
    season_number: r.season_number || null,
    included_titles: r.included_titles || undefined,
  };
}

async function searchTmdb(
  query: string,
  opts?: { year?: number; searchType?: "movie" | "tv" }
): Promise<MediaLookupResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
    body: { query, year: opts?.year, search_type: opts?.searchType },
  });
  if (error) throw new Error(error.message);
  return (data.results || []).map(mapTmdbResult);
}

async function searchBooks(query: string, isbn?: string): Promise<MediaLookupResult[]> {
  const { data, error } = await supabase.functions.invoke("book-lookup", {
    body: { query, isbn },
  });
  if (error) throw new Error(error.message);
  return (data.results || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    year: r.published_date ? parseInt(r.published_date) : null,
    cover_url: r.cover_url || null,
    genre: r.categories?.join(", ") || null,
    author: r.author,
    page_count: r.page_count,
    publisher: r.publisher,
    isbn: r.isbn,
    description: r.description,
    source: r.source,
  }));
}

async function searchMusic(query: string, barcode?: string): Promise<MediaLookupResult[]> {
  const { data, error } = await supabase.functions.invoke("music-lookup", {
    body: { query, barcode },
  });
  if (error) throw new Error(error.message);
  return (data.results || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    year: r.year || null,
    cover_url: r.cover_url || null,
    genre: r.genre || null,
    artist: r.artist,
    label: r.label,
    tracklist: r.tracklist,
    barcode: r.barcode,
    source: r.source,
  }));
}

async function searchGames(query: string): Promise<MediaLookupResult[]> {
  const { data, error } = await supabase.functions.invoke("game-lookup", {
    body: { query },
  });
  if (error) throw new Error(error.message);
  return (data.results || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    year: r.year || null,
    cover_url: r.cover_url || null,
    genre: r.genre || null,
    platforms: r.platforms,
    developer: r.developer,
    publisher: r.publisher,
    description: r.description,
    rating: r.rating,
    source: r.source,
  }));
}
