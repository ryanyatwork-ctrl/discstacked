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

    const { query, year, tmdb_id, search_type } = await req.json();

    // If tmdb_id is provided, fetch details directly
    if (tmdb_id) {
      const type = search_type === "tv" ? "tv" : "movie";
      const detailRes = await fetch(
        `https://api.themoviedb.org/3/${type}/${tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`
      );
      const detail = await detailRes.json();

      const title = type === "tv" ? detail.name : detail.title;
      const releaseDate = type === "tv" ? detail.first_air_date : detail.release_date;

      return new Response(JSON.stringify({
        tmdb_id: detail.id,
        title,
        year: releaseDate ? parseInt(releaseDate.substring(0, 4)) : null,
        poster_url: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
        genre: detail.genres?.map((g: any) => g.name).join(", ") || null,
        rating: detail.vote_average || null,
        overview: detail.overview || null,
        media_type: type,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Search by query
    if (!query) {
      throw new Error("Either 'query' or 'tmdb_id' is required");
    }

    const results: any[] = [];

    // Search movies first (unless explicitly searching TV only)
    if (search_type !== "tv") {
      let movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
      if (year) movieUrl += `&year=${year}`;
      const movieRes = await fetch(movieUrl);
      const movieData = await movieRes.json();
      for (const m of (movieData.results || []).slice(0, 5)) {
        results.push({
          tmdb_id: m.id,
          title: m.title,
          year: m.release_date ? parseInt(m.release_date.substring(0, 4)) : null,
          poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
          rating: m.vote_average || null,
          overview: m.overview || null,
          media_type: "movie",
        });
      }
    }

    // Also search TV shows
    if (search_type !== "movie") {
      let tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
      if (year) tvUrl += `&first_air_date_year=${year}`;
      const tvRes = await fetch(tvUrl);
      const tvData = await tvRes.json();
      for (const t of (tvData.results || []).slice(0, 5)) {
        results.push({
          tmdb_id: t.id,
          title: t.name,
          year: t.first_air_date ? parseInt(t.first_air_date.substring(0, 4)) : null,
          poster_url: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
          rating: t.vote_average || null,
          overview: t.overview || null,
          media_type: "tv",
        });
      }
    }

    // Search TV seasons if query looks like "Show: Season N"
    const seasonMatch = query.match(/^(.+?)[\s:]+[Ss]eason\s*(\d+)$/);
    if (seasonMatch) {
      const showName = seasonMatch[1].trim();
      const seasonNum = parseInt(seasonMatch[2]);
      
      // Find the TV show first
      const showUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(showName)}&language=en-US&page=1`;
      const showRes = await fetch(showUrl);
      const showData = await showRes.json();
      
      if (showData.results?.length > 0) {
        const show = showData.results[0];
        // Fetch season details
        const seasonUrl = `https://api.themoviedb.org/3/tv/${show.id}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=en-US`;
        const seasonRes = await fetch(seasonUrl);
        if (seasonRes.ok) {
          const season = await seasonRes.json();
          results.unshift({
            tmdb_id: show.id,
            title: `${show.name}: Season ${seasonNum}`,
            year: season.air_date ? parseInt(season.air_date.substring(0, 4)) : null,
            poster_url: season.poster_path ? `https://image.tmdb.org/t/p/w500${season.poster_path}` : null,
            rating: show.vote_average || null,
            overview: season.overview || show.overview || null,
            media_type: "tv_season",
          });
        }
      }
    }

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
