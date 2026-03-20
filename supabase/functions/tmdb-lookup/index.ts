import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { query, year, tmdb_id, search_type, barcode, get_posters } = await req.json();

    // --- Get alternate posters for a specific TMDB item ---
    if (get_posters && tmdb_id) {
      const type = search_type === "tv" ? "tv" : "movie";
      const imgRes = await fetch(
        `https://api.themoviedb.org/3/${type}/${tmdb_id}/images?api_key=${TMDB_API_KEY}&include_image_language=en,null`
      );
      const imgData = await imgRes.json();
      const posters = (imgData.posters || []).map((p: any) => ({
        poster_url: `https://image.tmdb.org/t/p/w500${p.file_path}`,
        width: p.width,
        height: p.height,
        language: p.iso_639_1,
        vote_average: p.vote_average,
      }));
      return new Response(JSON.stringify({ posters }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPC/Barcode lookup
    if (barcode) {
      try {
        const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
        if (upcRes.ok) {
          const upcData = await upcRes.json();
          if (upcData.items?.length > 0) {
            const upcItem = upcData.items[0];
            const upcTitle = upcItem.title || "";
            const cleanTitle = upcTitle
              .replace(/\b(blu-?ray|dvd|4k|uhd|digital|hd|widescreen|fullscreen)\b/gi, "")
              .replace(/\[.*?\]/g, "")
              .replace(/\(.*?\)/g, "")
              .replace(/\s+/g, " ")
              .trim();

            if (cleanTitle) {
              const movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=en-US&page=1`;
              const movieRes = await fetch(movieUrl);
              const movieData = await movieRes.json();

              if (movieData.results?.length > 0) {
                const m = movieData.results[0];
                const detailRes = await fetch(
                  `https://api.themoviedb.org/3/movie/${m.id}?api_key=${TMDB_API_KEY}&language=en-US`
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
                  runtime: detail.runtime || null,
                  tagline: detail.tagline || null,
                  media_type: "movie",
                  barcode_title: upcTitle,
                }), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }

              const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=en-US&page=1`;
              const tvRes = await fetch(tvUrl);
              const tvData = await tvRes.json();
              if (tvData.results?.length > 0) {
                const t = tvData.results[0];
                return new Response(JSON.stringify({
                  tmdb_id: t.id,
                  title: t.name,
                  year: t.first_air_date ? parseInt(t.first_air_date.substring(0, 4)) : null,
                  poster_url: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
                  rating: t.vote_average || null,
                  overview: t.overview || null,
                  media_type: "tv",
                  barcode_title: upcTitle,
                }), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }

              return new Response(JSON.stringify({
                title: upcTitle,
                barcode_title: upcTitle,
              }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        }
      } catch {
        // UPC lookup failed, fall through
      }

      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch details by tmdb_id
    if (tmdb_id) {
      const type = search_type === "tv" ? "tv" : "movie";
      const [detailRes, creditsRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/${type}/${tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`),
        fetch(`https://api.themoviedb.org/3/${type}/${tmdb_id}/credits?api_key=${TMDB_API_KEY}&language=en-US`),
      ]);
      const detail = await detailRes.json();
      const credits = creditsRes.ok ? await creditsRes.json() : {};

      const title = type === "tv" ? detail.name : detail.title;
      const releaseDate = type === "tv" ? detail.first_air_date : detail.release_date;

      const cast = (credits.cast || []).slice(0, 10).map((c: any) => ({
        name: c.name,
        character: c.character,
        profile_url: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
      }));

      const director = (credits.crew || []).filter((c: any) => c.job === "Director").map((c: any) => c.name);
      const writer = (credits.crew || []).filter((c: any) => c.job === "Writer" || c.job === "Screenplay").map((c: any) => c.name);
      const producer = (credits.crew || []).filter((c: any) => c.job === "Producer").map((c: any) => c.name);

      return new Response(JSON.stringify({
        tmdb_id: detail.id,
        title,
        year: releaseDate ? parseInt(releaseDate.substring(0, 4)) : null,
        poster_url: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
        genre: detail.genres?.map((g: any) => g.name).join(", ") || null,
        rating: detail.vote_average || null,
        overview: detail.overview || null,
        runtime: detail.runtime || detail.episode_run_time?.[0] || null,
        tagline: detail.tagline || null,
        media_type: type,
        cast,
        crew: { director, writer, producer },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Search by query
    if (!query) {
      throw new Error("Either 'query', 'tmdb_id', or 'barcode' is required");
    }

    const results: any[] = [];

    // Search movies (return up to 10)
    if (search_type !== "tv") {
      let movieUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
      if (year) movieUrl += `&year=${year}`;
      const movieRes = await fetch(movieUrl);
      const movieData = await movieRes.json();
      for (const m of (movieData.results || []).slice(0, 10)) {
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

    // Search TV shows (return up to 10)
    if (search_type !== "movie") {
      let tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
      if (year) tvUrl += `&first_air_date_year=${year}`;
      const tvRes = await fetch(tvUrl);
      const tvData = await tvRes.json();
      for (const t of (tvData.results || []).slice(0, 10)) {
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
      
      const showUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(showName)}&language=en-US&page=1`;
      const showRes = await fetch(showUrl);
      const showData = await showRes.json();
      
      if (showData.results?.length > 0) {
        const show = showData.results[0];
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
