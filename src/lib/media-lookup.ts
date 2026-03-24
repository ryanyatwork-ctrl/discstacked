import { supabase } from "@/integrations/supabase/client";
import { MediaTab } from "@/lib/types";

export interface MediaLookupResult {
  id: string;
  title: string;
  year: number | null;
  cover_url: string | null;
  genre: string | null;
  // Movies
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
}

export async function searchMedia(
  activeTab: MediaTab,
  query: string,
  opts?: { year?: number; barcode?: string; searchType?: "movie" | "tv" }
): Promise<MediaLookupResult[]> {
  if (activeTab === "movies" || activeTab === "music-films") {
    return searchTmdb(query, opts);
  }
  if (activeTab === "cds") {
    return searchMusic(query, opts?.barcode);
  }
  if (activeTab === "games") {
    return searchGames(query);
  }
  if (activeTab === "games") {
    return searchGames(query);
  }
  return [];
}

export async function lookupBarcode(
  activeTab: MediaTab,
  barcode: string
): Promise<{ direct?: MediaLookupResult; results?: MediaLookupResult[] }> {
  if (activeTab === "movies" || activeTab === "music-films") {
    const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
      body: { barcode },
    });
    if (error) throw new Error(error.message);
    if (data?.title) {
      return {
        direct: {
          id: String(data.tmdb_id || barcode),
          title: data.title,
          year: data.year || null,
          cover_url: data.poster_url || null,
          genre: data.genre || null,
          runtime: data.runtime,
          tagline: data.tagline,
          overview: data.overview,
          cast: data.cast,
          crew: data.crew,
        },
      };
    }
    if (data?.results?.length > 0) {
      return { results: data.results.map(mapTmdbResult) };
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

  // Games don't typically have barcodes
  return {};
}

// --- Internal search helpers ---

function mapTmdbResult(r: any): MediaLookupResult {
  return {
    id: `tmdb-${r.tmdb_id}`,
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
