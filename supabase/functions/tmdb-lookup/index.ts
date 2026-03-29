import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Keywords that indicate a multi-movie physical product
const MULTI_MOVIE_KEYWORDS = /\b(collection|trilogy|quadrilogy|anthology|pack|box\s*set|double\s*feature|triple\s*feature|2-film|3-film|4-film|5-film|6-film|2-movie|3-movie|4-movie|5-movie|6-movie)\b/i;

async function fetchTmdbMovieDetails(tmdbId: number, apiKey: string) {
  const [detailRes, creditsRes] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=en-US`),
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${apiKey}&language=en-US`),
  ]);
  const detail = await detailRes.json();
  const credits = creditsRes.ok ? await creditsRes.json() : {};

  const cast = (credits.cast || []).slice(0, 10).map((c: any) => ({
    name: c.name,
    character: c.character,
    profile_url: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
  }));
  const director = (credits.crew || []).filter((c: any) => c.job === "Director").map((c: any) => c.name);
  const writer = (credits.crew || []).filter((c: any) => c.job === "Writer" || c.job === "Screenplay").map((c: any) => c.name);
  const producer = (credits.crew || []).filter((c: any) => c.job === "Producer").map((c: any) => c.name);

  return {
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
    cast,
    crew: { director, writer, producer },
  };
}

async function searchTmdbMovie(query: string, apiKey: string) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");
    if (!TMDB_API_KEY) throw new Error("TMDB_API_KEY not configured");

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
      // --- Helper: detect formats from text ---
      function detectFormats(text: string): string[] {
        const allText = text.toUpperCase();
        const detected: string[] = [];
        if (/BLU-?RAY\s*\+\s*DVD/i.test(allText) || /DVD\s*\+\s*BLU-?RAY/i.test(allText)) {
          detected.push("Blu-ray", "DVD");
        } else if (/4K.*BLU-?RAY|BLU-?RAY.*4K|UHD.*BLU-?RAY/i.test(allText)) {
          detected.push("4K", "Blu-ray");
        } else {
          if (allText.includes("ULTRA HD") || allText.includes("4K") || allText.includes("UHD")) detected.push("4K");
          if (allText.includes("BLU-RAY") || allText.includes("BLU RAY") || allText.includes("BLURAY")) detected.push("Blu-ray");
          if (allText.includes("DVD") && !detected.includes("Blu-ray")) detected.push("DVD");
        }
        if (detected.length === 0 && (allText.includes("DIGITAL") || allText.includes("STREAMING"))) detected.push("Digital");
        if (detected.length === 0 && allText.includes("VHS")) detected.push("VHS");
        return detected;
      }

      // --- Helper: clean a product title for TMDB search ---
      function cleanProductTitle(raw: string): string {
        return raw
          .replace(/^[\w\s&.']+?\s*-\s*/i, "")
          .replace(/\b(blu-?ray|dvd|4k|uhd|ultra\s*hd|digital|hd|widescreen|fullscreen)\b/gi, "")
          .replace(/\[.*?\]/g, "")
          .replace(/\(.*?\)/g, "")
          .replace(/\s*[,+]\s*$/g, "")
          .replace(/\s+/g, " ")
          .trim();
      }

      // --- Helper: given a clean title + raw title + detected formats, do TMDB lookup and return Response ---
      async function processBarcodeTitle(cleanTitle: string, rawTitle: string, detected_formats: string[]) {
        // Multi-movie detection
        const hasSlash = cleanTitle.includes(" / ");
        const hasMultiKeyword = MULTI_MOVIE_KEYWORDS.test(cleanTitle);

        if (hasSlash || hasMultiKeyword) {
          let movieTitles: string[] = [];
          if (hasSlash) {
            movieTitles = cleanTitle.split(" / ").map(t => t.trim()).filter(Boolean);
          }

          if (!hasSlash && hasMultiKeyword) {
            const franchiseName = cleanTitle
              .replace(MULTI_MOVIE_KEYWORDS, "")
              .replace(/\s*:\s*$/, "")
              .replace(/\s+/g, " ")
              .trim();

            const collUrl = `https://api.themoviedb.org/3/search/collection?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(franchiseName)}&language=en-US`;
            const collRes = await fetch(collUrl);
            const collData = await collRes.json();

            if (collData.results?.length > 0) {
              const collId = collData.results[0].id;
              const collDetailRes = await fetch(
                `https://api.themoviedb.org/3/collection/${collId}?api_key=${TMDB_API_KEY}&language=en-US`
              );
              const collDetail = await collDetailRes.json();

              if (collDetail.parts?.length > 0) {
                const multiMovies = collDetail.parts.map((p: any) => ({
                  tmdb_id: p.id,
                  title: p.title,
                  year: p.release_date ? parseInt(p.release_date.substring(0, 4)) : null,
                  poster_url: p.poster_path ? `https://image.tmdb.org/t/p/w500${p.poster_path}` : null,
                  overview: p.overview || null,
                }));

                return {
                  is_multi_movie: true,
                  product_title: cleanTitle || rawTitle,
                  barcode_title: rawTitle,
                  detected_formats,
                  collection_name: collDetail.name,
                  multi_movies: multiMovies,
                };
              }
            }
          }

          if (movieTitles.length > 1) {
            const multiMovies: any[] = [];
            for (const mt of movieTitles) {
              const results = await searchTmdbMovie(mt, TMDB_API_KEY);
              if (results.length > 0) {
                const m = results[0];
                multiMovies.push({
                  tmdb_id: m.id,
                  title: m.title,
                  year: m.release_date ? parseInt(m.release_date.substring(0, 4)) : null,
                  poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
                  overview: m.overview || null,
                });
              } else {
                multiMovies.push({ tmdb_id: null, title: mt, year: null, poster_url: null, overview: null });
              }
            }
            return {
              is_multi_movie: true,
              product_title: cleanTitle || rawTitle,
              barcode_title: rawTitle,
              detected_formats,
              multi_movies: multiMovies,
            };
          }
        }

        // Single movie lookup
        if (cleanTitle) {
          const movieResults = await searchTmdbMovie(cleanTitle, TMDB_API_KEY);
          if (movieResults.length > 0) {
            const m = movieResults[0];
            const detail = await fetchTmdbMovieDetails(m.id, TMDB_API_KEY);
            return { ...detail, barcode_title: rawTitle, detected_formats };
          }

          // Try TV
          const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=en-US&page=1`;
          const tvRes = await fetch(tvUrl);
          const tvData = await tvRes.json();
          if (tvData.results?.length > 0) {
            const t = tvData.results[0];
            return {
              tmdb_id: t.id,
              title: t.name,
              year: t.first_air_date ? parseInt(t.first_air_date.substring(0, 4)) : null,
              poster_url: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
              rating: t.vote_average || null,
              overview: t.overview || null,
              media_type: "tv",
              barcode_title: rawTitle,
              detected_formats,
            };
          }

          // Partial match — we have a title but no TMDB match
          return { title: cleanTitle || rawTitle, barcode_title: rawTitle, detected_formats };
        }

        return null;
      }

      // ========== SOURCE 1: UPCitemdb ==========
      let upcTitle = "";
      let upcCleanTitle = "";
      let upcFormats: string[] = [];
      try {
        const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
        if (upcRes.ok) {
          const upcData = await upcRes.json();
          if (upcData.items?.length > 0) {
            const upcItem = upcData.items[0];
            upcTitle = upcItem.title || "";
            const allText = `${upcTitle} ${upcItem.category || ""} ${upcItem.description || ""}`;
            upcFormats = detectFormats(allText);
            upcCleanTitle = cleanProductTitle(upcTitle);

            if (upcCleanTitle) {
              const result = await processBarcodeTitle(upcCleanTitle, upcTitle, upcFormats);
              if (result) {
                return new Response(JSON.stringify(result), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }
            }
          }
        }
      } catch {
        // UPCitemdb failed, try next source
      }

      // ========== SOURCE 2: Barcodelookup.com ==========
      try {
        const bclRes = await fetch(`https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(barcode)}&formatted=y&key=`);
        // Free tier returns 403 without key, but trial may work for some
        if (bclRes.ok) {
          const bclData = await bclRes.json();
          if (bclData.products?.length > 0) {
            const bclItem = bclData.products[0];
            const bclTitle = bclItem.title || bclItem.product_name || "";
            const bclDesc = bclItem.description || bclItem.category || "";
            const bclAllText = `${bclTitle} ${bclDesc}`;
            const bclFormats = upcFormats.length > 0 ? upcFormats : detectFormats(bclAllText);
            const bclCleanTitle = cleanProductTitle(bclTitle);

            if (bclCleanTitle) {
              const result = await processBarcodeTitle(bclCleanTitle, bclTitle, bclFormats);
              if (result) {
                return new Response(JSON.stringify(result), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }
            }
          }
        }
      } catch {
        // Barcodelookup failed, try next source
      }

      // ========== SOURCE 3: Open Library ISBN lookup ==========
      try {
        const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(barcode)}&format=json&jscmd=data`);
        if (olRes.ok) {
          const olData = await olRes.json();
          const olKey = Object.keys(olData)[0];
          if (olKey && olData[olKey]?.title) {
            const olTitle = olData[olKey].title;
            const olCleanTitle = cleanProductTitle(olTitle);
            const olFormats = upcFormats.length > 0 ? upcFormats : [];

            if (olCleanTitle) {
              const result = await processBarcodeTitle(olCleanTitle, olTitle, olFormats);
              if (result) {
                return new Response(JSON.stringify(result), {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
              }
            }
          }
        }
      } catch {
        // Open Library failed, try next source
      }

      // ========== SOURCE 4: TMDB direct UPC/EAN lookup ==========
      try {
        const findRes = await fetch(`https://api.themoviedb.org/3/find/${encodeURIComponent(barcode)}?api_key=${TMDB_API_KEY}&external_source=upc&language=en-US`);
        if (findRes.ok) {
          const findData = await findRes.json();
          const movieResults = findData.movie_results || [];
          const tvResults = findData.tv_results || [];

          if (movieResults.length > 0) {
            const m = movieResults[0];
            const detail = await fetchTmdbMovieDetails(m.id, TMDB_API_KEY);
            const formats = upcFormats.length > 0 ? upcFormats : [];
            return new Response(JSON.stringify({ ...detail, barcode_title: m.title, detected_formats: formats }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (tvResults.length > 0) {
            const t = tvResults[0];
            const formats = upcFormats.length > 0 ? upcFormats : [];
            return new Response(JSON.stringify({
              tmdb_id: t.id,
              title: t.name,
              year: t.first_air_date ? parseInt(t.first_air_date.substring(0, 4)) : null,
              poster_url: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
              rating: t.vote_average || null,
              overview: t.overview || null,
              media_type: "tv",
              barcode_title: t.name,
              detected_formats: formats,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      } catch {
        // TMDB find failed, try fuzzy fallback
      }

      // ========== SOURCE 5: TMDB fuzzy title search (last resort, high confidence only) ==========
      const fallbackTitle = upcCleanTitle || "";
      if (fallbackTitle) {
        // Try movie search with high confidence threshold
        const movieResults = await searchTmdbMovie(fallbackTitle, TMDB_API_KEY);
        if (movieResults.length > 0) {
          const best = movieResults[0];
          const bestTitle = (best.title || "").toLowerCase();
          const searchTitle = fallbackTitle.toLowerCase();
          // Require the search title to appear substantially in the result title or vice versa
          const isHighConfidence = bestTitle.includes(searchTitle) || searchTitle.includes(bestTitle) ||
            bestTitle.split(/\s+/).filter((w: string) => searchTitle.includes(w)).length >= Math.max(1, Math.floor(searchTitle.split(/\s+/).length * 0.6));

          if (isHighConfidence) {
            const detail = await fetchTmdbMovieDetails(best.id, TMDB_API_KEY);
            return new Response(JSON.stringify({ ...detail, barcode_title: upcTitle, detected_formats: upcFormats }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // No high-confidence match — return partial data for soft-fail UI
        return new Response(JSON.stringify({
          title: fallbackTitle,
          barcode_title: upcTitle,
          detected_formats: upcFormats,
          barcode_not_found: false,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ========== ALL SOURCES FAILED ==========
      return new Response(JSON.stringify({
        barcode_not_found: true,
        barcode_value: barcode,
        title: "",
        detected_formats: [],
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch details by tmdb_id
    if (tmdb_id) {
      const type = search_type === "tv" ? "tv" : "movie";
      if (type === "movie") {
        const detail = await fetchTmdbMovieDetails(tmdb_id, TMDB_API_KEY);
        return new Response(JSON.stringify(detail), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      const [detailRes, creditsRes] = await Promise.all([
        fetch(`https://api.themoviedb.org/3/tv/${tmdb_id}?api_key=${TMDB_API_KEY}&language=en-US`),
        fetch(`https://api.themoviedb.org/3/tv/${tmdb_id}/credits?api_key=${TMDB_API_KEY}&language=en-US`),
      ]);
      const detail = await detailRes.json();
      const credits = creditsRes.ok ? await creditsRes.json() : {};
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
        title: detail.name,
        year: detail.first_air_date ? parseInt(detail.first_air_date.substring(0, 4)) : null,
        poster_url: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
        genre: detail.genres?.map((g: any) => g.name).join(", ") || null,
        rating: detail.vote_average || null,
        overview: detail.overview || null,
        runtime: detail.episode_run_time?.[0] || null,
        tagline: detail.tagline || null,
        media_type: "tv",
        cast,
        crew: { director, writer, producer },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Search by query
    if (!query) throw new Error("Either 'query', 'tmdb_id', or 'barcode' is required");

    const results: any[] = [];

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
