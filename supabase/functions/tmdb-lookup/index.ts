import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
    if (!TMDB_API_KEY) {
      throw new Error("TMDB_API_KEY not configured");
    }

    const { query, year, tmdb_id } = await req.json();

    // If tmdb_id is provided, fetch details directly
    if (tmdb_id) {
      const detailRes = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`
      );
      const detail = await detailRes.json();

      return new Response(JSON.stringify({
        tmdb_id: detail.id,
        title: detail.title,
        year: detail.release_date ? parseInt(detail.release_date.substring(0, 4)) : null,
        poster_url: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
        genre: detail.genres?.map((g: any) => g.name).join(", ") || null,
        rating: detail.vote_average || null,
        overview: detail.overview || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Search by query
    if (!query) {
      throw new Error("Either 'query' or 'tmdb_id' is required");
    }

    let url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
    if (year) {
      url += `&year=${year}`;
    }

    const searchRes = await fetch(url);
    const searchData = await searchRes.json();

    const results = (searchData.results || []).slice(0, 5).map((m: any) => ({
      tmdb_id: m.id,
      title: m.title,
      year: m.release_date ? parseInt(m.release_date.substring(0, 4)) : null,
      poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
      rating: m.vote_average || null,
      overview: m.overview || null,
    }));

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
