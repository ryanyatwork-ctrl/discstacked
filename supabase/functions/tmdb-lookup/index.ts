import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Keywords that indicate a multi-movie physical product.
// Matches: "collection", "trilogy", "quadrilogy", "pentalogy", "hexalogy",
// "anthology", "box set" / "boxset", "double/triple feature", "complete series/saga",
// "pack", and any N-film / N-movie variant with optional space or hyphen
// (e.g. "3-Film", "5 Movie", "5-movies", "2film").
const MULTI_MOVIE_KEYWORDS = /\b(collection|trilogy|quadrilogy|pentalogy|hexalogy|anthology|box\s*set|boxset|double\s*feature|triple\s*feature|complete\s*(series|saga)|pack|[2-9][\s-]?(film|movie)s?)\b/i;

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
      // --- Helper: detect formats from text.
      // Additive: every format present is captured so "Blu-ray + DVD + Digital Code"
      // yields ["Blu-ray", "DVD", "Digital"]. Box sets routinely combine 4K+Blu-ray+Digital.
      function detectFormats(text: string): string[] {
        const t = text.toUpperCase();
        const detected: string[] = [];
        // 4K / UHD — word boundary avoids matching e.g. "24K GOLD"
        if (/\b(4K|ULTRA\s*HD|UHD)\b/.test(t)) detected.push("4K");
        // Blu-ray (covers BLU-RAY, BLU RAY, BLURAY, BLU  RAY)
        if (/\bBLU[-\s]?RAY\b/.test(t)) detected.push("Blu-ray");
        // DVD
        if (/\bDVD\b/.test(t)) detected.push("DVD");
        // Digital (Digital Code / Copy / HD / Download / Movie, or plain "Digital", or Streaming)
        if (/\b(DIGITAL(?:\s*(?:CODE|COPY|HD|DOWNLOAD|MOVIE))?|STREAMING)\b/.test(t)) detected.push("Digital");
        // VHS
        if (/\bVHS\b/.test(t)) detected.push("VHS");
        return detected;
      }

      // --- Helper: clean a product title for TMDB search ---
      function cleanProductTitle(raw: string): string {
        let cleaned = raw
          .replace(/^[\w\s&.']+?\s*-\s*/i, "")
          .replace(/\b(blu-?ray|dvd|4k|uhd|ultra\s*hd|digital|hd|widescreen|fullscreen|unrated|special\s*edition|collector'?s?\s*edition|limited\s*edition)\b/gi, "")
          // Strip common studio/distributor names that barcode sources append
          .replace(/\b(Warner\s*Bros\.?|Walt\s*Disney|Universal|Paramount|Sony\s*Pictures?|Lionsgate|20th\s*Century\s*Fox|MGM|Columbia|DreamWorks|New\s*Line|Miramax|Touchstone|StudioCanal|Studio\s*Canal|Entertainment\s*One|eOne)\b/gi, "")
          // Strip genre words that barcode databases sometimes append to titles
          .replace(/\b(Action|Comedy|Drama|Horror|Thriller|Romance|Sci-Fi|Science\s*Fiction|Animation|Adventure|Fantasy|Documentary|Musical|Western|Mystery|Crime|War|History|Family|Music)\s*\.?\s*$/gi, "")
          // Strip trailing dots, commas, dashes after genre removal
          .replace(/[\s.\-,;:]+$/g, "")
          .replace(/\[.*?\]/g, "")
          .replace(/\(.*?\)/g, "")
          .replace(/\s*[,+]\s*$/g, "")
          .replace(/\s+/g, " ")
          .trim();
        // Second pass: strip genre fragments that might remain after other cleanup
        cleaned = cleaned
          .replace(/\b(Action|Comedy|Drama|Horror|Thriller|Romance|Sci-Fi|Science\s*Fiction|Animation|Adventure|Fantasy|Documentary|Musical|Western|Mystery|Crime|War|History|Family|Music)\s*\.?\s*$/gi, "")
          .replace(/[\s.\-,;:]+$/g, "")
          .trim();
        return cleaned;
      }

      // Normalize verbose TV season titles for TMDB search
      // e.g. "The Big Bang Theory: The Complete Seventh Season" → "The Big Bang Theory - Season 7"
      function normalizeTvSeasonTitle(title: string): { normalized: string; seasonNum: number | null } {
        const ordinals: Record<string, number> = {
          first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
          seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
          thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16,
          seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20,
        };
        // Match patterns like "The Complete Seventh Season" or "Complete Season 7" or "Season Seven"
        const ordinalPattern = /[:\-–]\s*(?:the\s+)?(?:complete\s+)?(\w+)\s+season\b/i;
        const numericPattern = /[:\-–]\s*(?:the\s+)?(?:complete\s+)?season\s*(\d+)/i;
        
        let seasonNum: number | null = null;
        let showName = title;
        
        const numMatch = title.match(numericPattern);
        if (numMatch) {
          seasonNum = parseInt(numMatch[1]);
          showName = title.substring(0, title.indexOf(numMatch[0])).trim();
        } else {
          const ordMatch = title.match(ordinalPattern);
          if (ordMatch) {
            const word = ordMatch[1].toLowerCase();
            if (ordinals[word]) {
              seasonNum = ordinals[word];
              showName = title.substring(0, title.indexOf(ordMatch[0])).trim();
            }
          }
        }
        
        if (seasonNum !== null) {
          return { normalized: `${showName} - Season ${seasonNum}`, seasonNum };
        }
        return { normalized: title, seasonNum: null };
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
            // The first segment often carries the box-set name as a prefix, e.g.
            // "Alien Quadrilogy: Alien / Aliens / Alien 3 / Alien Resurrection"
            // After split, movieTitles[0] = "Alien Quadrilogy: Alien" which fails
            // TMDB lookup. Strip prefixes that contain a multi-movie keyword.
            if (movieTitles.length > 1 && movieTitles[0].includes(":")) {
              const colonIdx = movieTitles[0].indexOf(":");
              const prefix = movieTitles[0].substring(0, colonIdx);
              if (MULTI_MOVIE_KEYWORDS.test(prefix)) {
                movieTitles[0] = movieTitles[0].substring(colonIdx + 1).trim();
              }
            }
          }

          if (!hasSlash && hasMultiKeyword) {
            // Strip ALL multi-movie keywords (global) and resulting orphan colons/dashes.
            // "The Divergent Series: 3-Film Collection" → "The Divergent Series"
            // "Dragonheart: 5-Movie Collection" → "Dragonheart"
            const globalKeywords = new RegExp(MULTI_MOVIE_KEYWORDS.source, "gi");
            const franchiseName = cleanTitle
              .replace(globalKeywords, "")
              .replace(/[:,;]+/g, " ")
              .replace(/\s+-\s+/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            // Try multiple search queries: full title first, then franchise name.
            // Rank candidates so we accept close matches (e.g. "Dragonheart Collection"
            // vs franchise "Dragonheart", or "The Divergent Collection" vs
            // "The Divergent Series") without over-matching unrelated collections.
            const searchQueries = [cleanTitle, franchiseName].filter(Boolean);
            const fn = franchiseName.toLowerCase().trim();
            // Core form: strip "the " prefix and trailing " series" so CLZ-style
            // names align with TMDB's shorter collection names.
            const fnCore = fn.replace(/^the\s+/, "").replace(/\s+series$/, "").trim();
            let bestCollection: any = null;
            let bestScore = 0;

            for (const sq of searchQueries) {
              const collUrl = `https://api.themoviedb.org/3/search/collection?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(sq)}&language=en-US`;
              const collRes = await fetch(collUrl);
              const collData = await collRes.json();

              if (collData.results?.length > 0) {
                for (const c of collData.results) {
                  const cn = (c.name || "").toLowerCase();
                  // Strip trailing markers like "Collection", "Saga", "Trilogy",
                  // "Anthology", "Series Collection" to get the franchise core.
                  const cnBase = cn
                    .replace(/\s*(series\s*collection|collection|saga|trilogy|anthology|quadrilogy|pentalogy)\s*$/i, "")
                    .trim();
                  const cnCore = cnBase.replace(/^the\s+/, "").replace(/\s+series$/, "").trim();
                  let score = 0;
                  if (cnCore && fnCore && cnCore === fnCore) score = 100;
                  else if (cnBase === fn) score = 95;
                  else if (cn === fn) score = 92;
                  else if (fnCore && cnCore && (cnCore.startsWith(fnCore + " ") || fnCore.startsWith(cnCore + " "))) score = 80;
                  else if (cnBase.startsWith(fn + " ") || fn.startsWith(cnBase + " ")) score = 75;
                  else if (fn.length >= 4 && cn.includes(fn)) score = 55;
                  if (score > bestScore) {
                    bestScore = score;
                    bestCollection = c;
                  }
                }
                // Early exit on strong match
                if (bestScore >= 95) break;
              }
            }

            if (bestCollection) {
              const collDetailRes = await fetch(
                `https://api.themoviedb.org/3/collection/${bestCollection.id}?api_key=${TMDB_API_KEY}&language=en-US`
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
                  media_type: "box_set",
                  multi_movies: multiMovies,
                  included_titles: multiMovies.map((m: any) => ({
                    title: m.title,
                    year: m.year,
                    tmdb_id: m.tmdb_id,
                  })),
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
              media_type: "box_set",
              multi_movies: multiMovies,
              included_titles: multiMovies.map((m: any) => ({
                title: m.title,
                year: m.year,
                tmdb_id: m.tmdb_id,
              })),
            };
          }
        }

        // Single movie lookup
        if (cleanTitle) {
          // Try normalizing as a TV season title first
          const { normalized: tvNormalized, seasonNum } = normalizeTvSeasonTitle(cleanTitle);
          
          // If it looks like a TV season, try TV search first
          if (seasonNum !== null) {
            const showName = tvNormalized.replace(/\s*-\s*Season\s*\d+$/i, "").trim();
            const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(showName)}&language=en-US&page=1`;
            const tvRes = await fetch(tvUrl);
            const tvData = await tvRes.json();
            if (tvData.results?.length > 0) {
              const show = tvData.results[0];
              // Try to get season-specific poster
              try {
                const seasonUrl = `https://api.themoviedb.org/3/tv/${show.id}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=en-US`;
                const seasonRes = await fetch(seasonUrl);
                if (seasonRes.ok) {
                  const season = await seasonRes.json();
                  return {
                    tmdb_id: show.id,
                    tmdb_series_id: show.id,
                    season_number: seasonNum,
                    title: `${show.name} - Season ${seasonNum}`,
                    year: season.air_date ? parseInt(season.air_date.substring(0, 4)) : (show.first_air_date ? parseInt(show.first_air_date.substring(0, 4)) : null),
                    poster_url: season.poster_path ? `https://image.tmdb.org/t/p/w500${season.poster_path}` : (show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null),
                    rating: show.vote_average || null,
                    overview: season.overview || show.overview || null,
                    genre: (show.genres || show.genre_ids || []).length > 0 ? undefined : null,
                    media_type: "tv_season",
                    episode_count: season.episodes?.length || null,
                    barcode_title: rawTitle,
                    detected_formats,
                  };
                }
              } catch {}
              // Fallback to show-level data
              return {
                tmdb_id: show.id,
                tmdb_series_id: show.id,
                season_number: seasonNum,
                title: `${show.name} - Season ${seasonNum}`,
                year: show.first_air_date ? parseInt(show.first_air_date.substring(0, 4)) : null,
                poster_url: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
                rating: show.vote_average || null,
                overview: show.overview || null,
                media_type: "tv_season",
                barcode_title: rawTitle,
                detected_formats,
              };
            }
          }

          const movieResults = await searchTmdbMovie(cleanTitle, TMDB_API_KEY);
          if (movieResults.length > 0) {
            const m = movieResults[0];
            const detail = await fetchTmdbMovieDetails(m.id, TMDB_API_KEY);
            return { ...detail, barcode_title: rawTitle, detected_formats };
          }

          // Try TV (for non-season titles)
          if (seasonNum === null) {
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
          }

          // Partial match — we have a title but no TMDB match
          return { title: cleanTitle || rawTitle, barcode_title: rawTitle, detected_formats };
        }

        return null;
      }

      // Debug log accumulator
      const debugLog: { source: string; status: string; raw?: any }[] = [];
      let upcTitle = "";
      let upcCleanTitle = "";
      let upcFormats: string[] = [];

      // ========== SOURCE 1: UPCitemdb ==========
      try {
        const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
        const upcRaw = upcRes.ok ? await upcRes.json() : null;
        if (upcRaw?.items?.length > 0) {
          const upcItem = upcRaw.items[0];
          upcTitle = upcItem.title || "";
          const allText = `${upcTitle} ${upcItem.category || ""} ${upcItem.description || ""}`;
          upcFormats = detectFormats(allText);
          upcCleanTitle = cleanProductTitle(upcTitle);
          debugLog.push({ source: "UPCitemdb", status: "HIT", raw: { title: upcTitle, category: upcItem.category, brand: upcItem.brand } });

          if (upcCleanTitle) {
            const result = await processBarcodeTitle(upcCleanTitle, upcTitle, upcFormats);
            if (result) {
              return new Response(JSON.stringify({ ...result, _debug: debugLog }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } else {
          debugLog.push({ source: "UPCitemdb", status: "MISS", raw: upcRaw });
        }
      } catch (e) {
        debugLog.push({ source: "UPCitemdb", status: "ERROR", raw: String(e) });
      }

      // ========== SOURCE 2: Discogs ==========
      try {
        const discogsRes = await fetch(`https://api.discogs.com/database/search?barcode=${encodeURIComponent(barcode)}&type=release`, {
          headers: { "User-Agent": "DiscStacked/1.0" },
        });
        const discogsRaw = discogsRes.ok ? await discogsRes.json() : null;
        if (discogsRaw?.results?.length > 0) {
          const discogsItem = discogsRaw.results[0];
          const discogsTitle = discogsItem.title || "";
          const discogsAllText = `${discogsTitle} ${(discogsItem.format || []).join(" ")} ${(discogsItem.label || []).join(" ")}`;
          const discogsFormats = upcFormats.length > 0 ? upcFormats : detectFormats(discogsAllText);
          const discogsCleanTitle = cleanProductTitle(discogsTitle);
          debugLog.push({ source: "Discogs", status: "HIT", raw: { title: discogsTitle, format: discogsItem.format, type: discogsItem.type, year: discogsItem.year } });

          if (discogsCleanTitle) {
            const result = await processBarcodeTitle(discogsCleanTitle, discogsTitle, discogsFormats);
            if (result) {
              return new Response(JSON.stringify({ ...result, _debug: debugLog }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } else {
          debugLog.push({ source: "Discogs", status: "MISS", raw: discogsRaw });
        }
      } catch (e) {
        debugLog.push({ source: "Discogs", status: "ERROR", raw: String(e) });
      }

      // ========== SOURCE 3: Open Library ISBN lookup ==========
      try {
        const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(barcode)}&format=json&jscmd=data`);
        const olRaw = olRes.ok ? await olRes.json() : null;
        const olKey = olRaw ? Object.keys(olRaw)[0] : null;
        if (olKey && olRaw[olKey]?.title) {
          const olTitle = olRaw[olKey].title;
          const olCleanTitle = cleanProductTitle(olTitle);
          const olFormats = upcFormats.length > 0 ? upcFormats : [];
          debugLog.push({ source: "OpenLibrary", status: "HIT", raw: { title: olTitle } });

          if (olCleanTitle) {
            const result = await processBarcodeTitle(olCleanTitle, olTitle, olFormats);
            if (result) {
              return new Response(JSON.stringify({ ...result, _debug: debugLog }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } else {
          debugLog.push({ source: "OpenLibrary", status: "MISS", raw: olRaw });
        }
      } catch (e) {
        debugLog.push({ source: "OpenLibrary", status: "ERROR", raw: String(e) });
      }

      // ========== SOURCE 4: TMDB direct UPC/EAN lookup ==========
      try {
        const findRes = await fetch(`https://api.themoviedb.org/3/find/${encodeURIComponent(barcode)}?api_key=${TMDB_API_KEY}&external_source=upc&language=en-US`);
        const findRaw = findRes.ok ? await findRes.json() : null;
        const movieResults = findRaw?.movie_results || [];
        const tvResults = findRaw?.tv_results || [];

        if (movieResults.length > 0) {
          const m = movieResults[0];
          const detail = await fetchTmdbMovieDetails(m.id, TMDB_API_KEY);
          const formats = upcFormats.length > 0 ? upcFormats : [];
          debugLog.push({ source: "TMDB-UPC", status: "HIT-movie", raw: { id: m.id, title: m.title } });
          return new Response(JSON.stringify({ ...detail, barcode_title: m.title, detected_formats: formats, _debug: debugLog }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (tvResults.length > 0) {
          const t = tvResults[0];
          const formats = upcFormats.length > 0 ? upcFormats : [];
          debugLog.push({ source: "TMDB-UPC", status: "HIT-tv", raw: { id: t.id, title: t.name } });
          return new Response(JSON.stringify({
            tmdb_id: t.id, title: t.name,
            year: t.first_air_date ? parseInt(t.first_air_date.substring(0, 4)) : null,
            poster_url: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
            rating: t.vote_average || null, overview: t.overview || null,
            media_type: "tv", barcode_title: t.name, detected_formats: formats, _debug: debugLog,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        debugLog.push({ source: "TMDB-UPC", status: "MISS", raw: findRaw });
      } catch (e) {
        debugLog.push({ source: "TMDB-UPC", status: "ERROR", raw: String(e) });
      }

      // ========== SOURCE 5: TMDB fuzzy title search (last resort, high confidence only) ==========
      const fallbackTitle = upcCleanTitle || "";
      if (fallbackTitle) {
        const movieResults = await searchTmdbMovie(fallbackTitle, TMDB_API_KEY);
        if (movieResults.length > 0) {
          const best = movieResults[0];
          const bestTitle = (best.title || "").toLowerCase();
          const searchTitle = fallbackTitle.toLowerCase();
          const isHighConfidence = bestTitle.includes(searchTitle) || searchTitle.includes(bestTitle) ||
            bestTitle.split(/\s+/).filter((w: string) => searchTitle.includes(w)).length >= Math.max(1, Math.floor(searchTitle.split(/\s+/).length * 0.6));

          debugLog.push({ source: "TMDB-fuzzy", status: isHighConfidence ? "HIT-highconf" : "MISS-lowconf", raw: { query: fallbackTitle, bestResult: best.title, bestId: best.id } });

          if (isHighConfidence) {
            const detail = await fetchTmdbMovieDetails(best.id, TMDB_API_KEY);
            return new Response(JSON.stringify({ ...detail, barcode_title: upcTitle, detected_formats: upcFormats, _debug: debugLog }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          debugLog.push({ source: "TMDB-fuzzy", status: "MISS-noresults", raw: { query: fallbackTitle } });
        }

        // Partial data soft-fail
        return new Response(JSON.stringify({
          title: fallbackTitle, barcode_title: upcTitle, detected_formats: upcFormats,
          barcode_not_found: false, _debug: debugLog,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ========== ALL SOURCES FAILED ==========
      debugLog.push({ source: "ALL", status: "FAILED" });
      return new Response(JSON.stringify({
        barcode_not_found: true, barcode_value: barcode,
        title: "", detected_formats: [], _debug: debugLog,
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
            tmdb_series_id: show.id,
            season_number: seasonNum,
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
