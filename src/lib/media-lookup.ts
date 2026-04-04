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

export type BarcodeLookupResult = {
  direct?: MediaLookupResult;
  results?: MediaLookupResult[];
  multiMovie?: MultiMovieResult;
  partialTitle?: string;
  partialFormats?: string[];
};

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
    const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
      body: { barcode },
    });
    if (error) throw new Error(error.message);

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
      };
    }

    if (data?.title) {
      return {
        direct: {
          id: String(data.tmdb_id || barcode),
          tmdb_id: data.tmdb_id || null,
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
        },
      };
    }
    if (data?.results?.length > 0) {
      return { results: data.results.map(mapTmdbResult) };
    }
    // Barcode not found or partial match — return partial data for soft-fail UX
    if (data?.barcode_not_found || (data?.title && !data?.tmdb_id)) {
      return {
        partialTitle: data.title || "",
        partialFormats: data.detected_formats || [],
      };
    }
    return {};
  }

  if (activeTab === "cds") {
    const { data, error } = await supabase.functions.invoke("music-lookup", {
      body: { barcode },
    });
    if (error) throw new Error(error.message);
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
      };
    }
    if (data?.results?.length > 0) {
      return { results: data.results };
    }
    return {};
  }

  return {};
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
