import { supabase } from "@/integrations/supabase/client";

export interface TmdbResult {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  rating: number | null;
  overview: string | null;
  genre?: string | null;
}

export async function searchTmdb(query: string, year?: number): Promise<TmdbResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
    body: { query, year },
  });

  if (error) throw new Error(error.message);
  return data.results || [];
}

export async function getTmdbDetails(tmdbId: number): Promise<TmdbResult | null> {
  const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
    body: { tmdb_id: tmdbId },
  });

  if (error) throw new Error(error.message);
  return data || null;
}
