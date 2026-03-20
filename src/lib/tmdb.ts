import { supabase } from "@/integrations/supabase/client";

export interface TmdbCast {
  name: string;
  character: string;
  profile_url: string | null;
}

export interface TmdbCrew {
  director: string[];
  writer: string[];
  producer: string[];
}

export interface TmdbResult {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  rating: number | null;
  overview: string | null;
  genre?: string | null;
  runtime?: number | null;
  tagline?: string | null;
  media_type?: string;
  cast?: TmdbCast[];
  crew?: TmdbCrew;
}

export async function searchTmdb(query: string, year?: number, searchType?: "movie" | "tv"): Promise<TmdbResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
    body: { query, year, search_type: searchType },
  });

  if (error) throw new Error(error.message);
  return data.results || [];
}

export async function getTmdbDetails(tmdbId: number, searchType?: "movie" | "tv"): Promise<TmdbResult | null> {
  const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
    body: { tmdb_id: tmdbId, search_type: searchType },
  });

  if (error) throw new Error(error.message);
  return data || null;
}

export interface TmdbPoster {
  poster_url: string;
  width: number;
  height: number;
  language: string | null;
  vote_average: number;
}

export async function getTmdbPosters(tmdbId: number, searchType?: "movie" | "tv"): Promise<TmdbPoster[]> {
  const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
    body: { tmdb_id: tmdbId, search_type: searchType, get_posters: true },
  });

  if (error) throw new Error(error.message);
  return data?.posters || [];
}
