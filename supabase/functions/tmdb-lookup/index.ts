import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { cleanProductTitle, extractYearFromText, generateTitleCandidates, normalizeLookupText, scoreMovieResult } from "./lookup-utils.ts";

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

function scoreCollectionMatch(query: string, name: string) {
  const normalizedQuery = normalizeLookupText(query)
    .replace(/\b(?:chapters?|collection|trilogy|quadrilogy|anthology|pack|box\s*set|double\s*feature|triple\s*feature|feature|film|movie|complete)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedName = normalizeLookupText(name)
    .replace(/\bcollection\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizedQuery || !normalizedName) return 0;
  if (normalizedName === normalizedQuery) return 100;
  if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) return 85;

  const queryWords = new Set(normalizeLookupText(query).split(" ").filter(Boolean));
  const nameWords = new Set(normalizeLookupText(name).split(" ").filter(Boolean));
  const overlap = Array.from(queryWords).filter((word) => nameWords.has(word)).length;
  return Math.round((overlap / Math.max(queryWords.size, 1)) * 70);
}

function splitMultiTitleCandidates(title: string): string[] {
  const cleaned = title.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  if (cleaned.includes("/")) {
    return cleaned.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  }

  const numericSet = cleaned.match(/^(.+?)\s+(\d+)\s*&\s*(\d+)$/i);
  if (numericSet) {
    const base = numericSet[1].trim();
    return [numericSet[2], numericSet[3]].map((n) => `${base} ${n}`);
  }

  return [];
}

function expandSharedFranchiseTitles(movieTitles: string[]): string[] {
  if (movieTitles.length <= 1) return movieTitles;

  const first = movieTitles[0];
  const franchisePrefixMatch = first.match(/^(.+?)(?::|\s+-\s+|\s+chapter\b|\s+part\b|\s+\d\b)/i);
  const franchisePrefix = franchisePrefixMatch?.[1]?.trim();

  if (!franchisePrefix) return movieTitles;

  // If the leading prefix is itself a multi-movie keyword (e.g.
  // "Alien Quadrilogy: Alien / Aliens / Alien 3 / Alien Resurrection"),
  // the prefix is the box-set name, not a franchise shared with siblings.
  // Strip it from the first title and leave siblings alone — each is a
  // standalone movie query.
  if (MULTI_MOVIE_KEYWORDS.test(franchisePrefix)) {
    const colonIdx = first.indexOf(":");
    const stripped = colonIdx !== -1
      ? first.substring(colonIdx + 1).trim()
      : first.replace(franchisePrefix, "").trim();
    return [stripped, ...movieTitles.slice(1)];
  }

  return movieTitles.map((title, index) => {
    if (index === 0) return title;
    if (new RegExp(`^${franchisePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(title)) return title;
    return `${franchisePrefix} ${title}`.replace(/\s+/g, " ").trim();
  });
}

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

async function searchTmdbMovie(query: string, apiKey: string, year?: number | null) {
  let url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
  if (year) url += `&year=${year}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results || [];
}

function buildJsonResponse(payload: Record<string, any>, debugLog: { source: string; status: string; raw?: any }[]) {
  const { _matchScore, ...cleanPayload } = payload;

  return new Response(JSON.stringify({ ...cleanPayload, _debug: debugLog }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isStrongResolvedMatch(payload: Record<string, any> | null) {
  if (!payload) return false;
  return (payload._matchScore || 0) >= 170 || payload.is_multi_movie || payload.media_type === "tv_season";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const TMDB_API_KEY: string = Deno.env.get("TMDB_API_KEY") || "";
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

      async function resolveBestMovieMatch(cleanTitle: string, rawTitle: string, barcodeYear?: number | null) {
        const candidates = generateTitleCandidates(rawTitle, cleanTitle);
        let bestMatch: { movie: any; score: number } | null = null;

        for (const candidate of candidates) {
          const deduped = new Map<number, any>();
          const [yearMatches, generalMatches] = await Promise.all([
            barcodeYear ? searchTmdbMovie(candidate, TMDB_API_KEY, barcodeYear) : Promise.resolve([]),
            searchTmdbMovie(candidate, TMDB_API_KEY),
          ]);

          for (const movie of [...yearMatches, ...generalMatches]) {
            if (!deduped.has(movie.id)) deduped.set(movie.id, movie);
          }

          for (const movie of deduped.values()) {
            const score = scoreMovieResult(candidate, movie, barcodeYear);
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { movie, score };
            }
          }
        }

        return bestMatch;
      }

      // --- Helper: given a clean title + raw title + detected formats, do TMDB lookup and return Response ---
      async function processBarcodeTitle(cleanTitle: string, rawTitle: string, detected_formats: string[], barcodeYear?: number | null) {
        // Multi-movie detection
        const hasSlash = cleanTitle.includes("/");
        const hasMultiKeyword = MULTI_MOVIE_KEYWORDS.test(cleanTitle);

        if (hasSlash || hasMultiKeyword) {
          let movieTitles: string[] = [];
          if (hasSlash) {
            movieTitles = expandSharedFranchiseTitles(splitMultiTitleCandidates(cleanTitle));
          }

          if (!hasSlash && hasMultiKeyword) {
            // Strip ALL multi-movie keywords (global) plus chapter/number ranges
            // and orphan colons/dashes. e.g.:
            //   "The Divergent Series: 3-Film Collection" → "The Divergent Series"
            //   "Dragonheart: 5-Movie Collection" → "Dragonheart"
            //   "Matrix Trilogy: Chapters 1-3" → "Matrix"
            const globalKeywords = new RegExp(MULTI_MOVIE_KEYWORDS.source, "gi");
            const franchiseName = cleanTitle
              .replace(globalKeywords, "")
              .replace(/\b(?:chapters?\s*\d+(?:\s*[-–]&?\s*\d+)?|\d+\s*&\s*\d+|\d+\s*[-–]\s*\d+)\b/gi, "")
              .replace(/[:,;]+/g, " ")
              .replace(/\s+-\s+/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            // Try multiple search queries: full title first, then franchise name
            const searchQueries = [cleanTitle, franchiseName].filter(Boolean);
            let bestCollection: any = null;

            for (const sq of searchQueries) {
              const collUrl = `https://api.themoviedb.org/3/search/collection?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(sq)}&language=en-US`;
              const collRes = await fetch(collUrl);
              const collData = await collRes.json();

              if (collData.results?.length > 0) {
                const ranked = collData.results
                  .map((c: any) => ({ collection: c, score: scoreCollectionMatch(franchiseName, c.name || "") }))
                  .sort((a: any, b: any) => b.score - a.score);
                const matched = ranked[0]?.score >= 65 ? ranked[0].collection : null;
                if (matched) {
                  bestCollection = matched;
                  break;
                }
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
                  _matchScore: 220,
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
              const bestMovieMatch = await resolveBestMovieMatch(mt, mt, barcodeYear);
              if (bestMovieMatch) {
                const m = bestMovieMatch.movie;
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
              _matchScore: 210,
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
               const rankedShows = tvData.results
                 .map((show: any) => ({ show, score: scoreCollectionMatch(showName, show.name || "") }))
                 .sort((a: any, b: any) => b.score - a.score);
               const show = rankedShows[0]?.show;
               if (!show) {
                 return { title: cleanTitle || rawTitle, barcode_title: rawTitle, detected_formats, _matchScore: 10 };
               }
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
                    _matchScore: 200,
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
                _matchScore: 185,
              };
            }
          }

          const bestMovieMatch = await resolveBestMovieMatch(cleanTitle, rawTitle, barcodeYear);
          if (bestMovieMatch && bestMovieMatch.score >= 70) {
            const detail = await fetchTmdbMovieDetails(bestMovieMatch.movie.id, TMDB_API_KEY);
            return { ...detail, barcode_title: rawTitle, detected_formats, _matchScore: bestMovieMatch.score };
          }

          // Try TV (for non-season titles)
          if (seasonNum === null) {
            const tvUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanTitle)}&language=en-US&page=1`;
            const tvRes = await fetch(tvUrl);
            const tvData = await tvRes.json();
            if (tvData.results?.length > 0) {
              const t = tvData.results[0];
              // Enrich with series-level aggregates (episode count, season count) so
              // "TV complete-series" scans aren't treated as thin stub rows.
              let episode_count: number | null = null;
              let tmdb_series_id: number | null = t.id;
              try {
                const detRes = await fetch(
                  `https://api.themoviedb.org/3/tv/${t.id}?api_key=${TMDB_API_KEY}&language=en-US`
                );
                if (detRes.ok) {
                  const det = await detRes.json();
                  if (typeof det.number_of_episodes === "number") {
                    episode_count = det.number_of_episodes;
                  }
                }
              } catch {
                // Enrichment is best-effort; fall through with nulls.
              }
              return {
                tmdb_id: t.id,
                tmdb_series_id,
                title: t.name,
                year: t.first_air_date ? parseInt(t.first_air_date.substring(0, 4)) : null,
                poster_url: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
                rating: t.vote_average || null,
                overview: t.overview || null,
                media_type: "tv",
                episode_count,
                barcode_title: rawTitle,
                detected_formats,
                _matchScore: 110,
              };
            }
          }

          // Partial match — we have a title but no TMDB match
          return { title: cleanTitle || rawTitle, barcode_title: rawTitle, detected_formats, _matchScore: 10 };
        }

        return null;
      }

      // Debug log accumulator
      const debugLog: { source: string; status: string; raw?: any }[] = [];
      let upcTitle = "";
      let upcCleanTitle = "";
      let upcFormats: string[] = [];
      let barcodeYear: number | null = null;
      let bestResolved: Record<string, any> | null = null;

      const considerResolved = (resolved: Record<string, any> | null) => {
        if (!resolved) return false;
        if (!bestResolved || (resolved._matchScore || 0) > (bestResolved._matchScore || 0)) {
          bestResolved = resolved;
        }
        return isStrongResolvedMatch(resolved);
      };

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
          if (!barcodeYear) barcodeYear = extractYearFromText(upcTitle);
          debugLog.push({ source: "UPCitemdb", status: "HIT", raw: { title: upcTitle, category: upcItem.category, brand: upcItem.brand } });

          if (upcCleanTitle) {
            const result = await processBarcodeTitle(upcCleanTitle, upcTitle, upcFormats, barcodeYear);
            if (considerResolved(result)) return buildJsonResponse(result!, debugLog);
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
          // Extract year from Discogs if available
          if (discogsItem.year && !barcodeYear) {
            const y = parseInt(String(discogsItem.year));
            if (y >= 1900 && y <= 2100) barcodeYear = y;
          }
          if (!barcodeYear) barcodeYear = extractYearFromText(discogsTitle);
          debugLog.push({ source: "Discogs", status: "HIT", raw: { title: discogsTitle, format: discogsItem.format, type: discogsItem.type, year: discogsItem.year } });

          if (discogsCleanTitle) {
            const result = await processBarcodeTitle(discogsCleanTitle, discogsTitle, discogsFormats, barcodeYear);
            if (considerResolved(result)) return buildJsonResponse(result!, debugLog);
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
            const result = await processBarcodeTitle(olCleanTitle, olTitle, olFormats, barcodeYear);
            if (considerResolved(result)) return buildJsonResponse(result!, debugLog);
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
          return buildJsonResponse({ ...detail, barcode_title: m.title, detected_formats: formats, _matchScore: 250 }, debugLog);
        }
        if (tvResults.length > 0) {
          const t = tvResults[0];
          const formats = upcFormats.length > 0 ? upcFormats : [];
          // Best-effort episode count enrichment for direct UPC→TV matches.
          let episode_count: number | null = null;
          try {
            const detRes = await fetch(
              `https://api.themoviedb.org/3/tv/${t.id}?api_key=${TMDB_API_KEY}&language=en-US`
            );
            if (detRes.ok) {
              const det = await detRes.json();
              if (typeof det.number_of_episodes === "number") {
                episode_count = det.number_of_episodes;
              }
            }
          } catch {
            // Enrichment is best-effort; fall through with null.
          }
          debugLog.push({ source: "TMDB-UPC", status: "HIT-tv", raw: { id: t.id, title: t.name } });
          return buildJsonResponse({
            tmdb_id: t.id,
            tmdb_series_id: t.id,
            title: t.name,
            year: t.first_air_date ? parseInt(t.first_air_date.substring(0, 4)) : null,
            poster_url: t.poster_path ? `https://image.tmdb.org/t/p/w500${t.poster_path}` : null,
            rating: t.vote_average || null,
            overview: t.overview || null,
            media_type: "tv",
            episode_count,
            barcode_title: t.name,
            detected_formats: formats,
            _matchScore: 230,
          }, debugLog);
        }
        debugLog.push({ source: "TMDB-UPC", status: "MISS", raw: findRaw });
      } catch (e) {
        debugLog.push({ source: "TMDB-UPC", status: "ERROR", raw: String(e) });
      }

      // ========== SOURCE 5: TMDB fuzzy title search (last resort, high confidence only) ==========
      const fallbackTitle = upcCleanTitle || "";
      if (fallbackTitle) {
        const fuzzyResult = await processBarcodeTitle(fallbackTitle, upcTitle || fallbackTitle, upcFormats, barcodeYear);
        if (fuzzyResult) {
          debugLog.push({ source: "TMDB-fuzzy", status: (fuzzyResult._matchScore || 0) >= 70 ? "HIT" : "PARTIAL", raw: { query: fallbackTitle, score: fuzzyResult._matchScore || 0 } });
          considerResolved(fuzzyResult);
        } else {
          debugLog.push({ source: "TMDB-fuzzy", status: "MISS-noresults", raw: { query: fallbackTitle } });
        }
      }

      if (bestResolved) {
        return buildJsonResponse(bestResolved, debugLog);
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
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
