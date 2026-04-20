import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  MULTI_MOVIE_KEYWORDS,
  cleanProductTitle,
  extractCollectionFranchiseName,
  extractYearFromText,
  expandSharedFranchiseTitles,
  generateTitleCandidates,
  parseTvIndicator,
  scoreCollectionMatch,
  scoreMovieResult,
  splitMultiTitleCandidates,
} from "./lookup-utils.ts";
import { BARCODE_OVERRIDES, type BarcodeOverride } from "./barcode-overrides.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function detectFormats(text: string): string[] {
  const upper = text.toUpperCase();
  const detected: string[] = [];

  if (/\b(4K|ULTRA\s*HD|UHD)\b/.test(upper)) detected.push("4K");
  if (/\bBLU[-\s]?RAY\b/.test(upper)) detected.push("Blu-ray");
  if (/\bDVD\b/.test(upper)) detected.push("DVD");
  if (/\b(DIGITAL(?:\s*(?:CODE|COPY|HD|DOWNLOAD|MOVIE))?|STREAMING)\b/.test(upper)) detected.push("Digital");
  if (/\bVHS\b/.test(upper)) detected.push("VHS");

  return detected;
}

type PackageContext = {
  rawTitle: string;
  productTitle: string;
  detectedFormats: string[];
  discCount?: number | null;
  editionLabel?: string | null;
  digitalCodeExpected?: boolean | null;
  slipcoverExpected?: boolean | null;
  packageImageUrl?: string | null;
};

function dedupeFormats(formats: string[]) {
  return Array.from(new Set(formats.filter(Boolean)));
}

function extractDiscCount(text?: string | null): number | null {
  if (!text) return null;

  const numericMatch = text.match(/\b(\d+)\s*[- ]?(?:disc|discs|dvd|blu[- ]?ray)\b/i);
  if (numericMatch) return parseInt(numericMatch[1], 10);

  const packMatch = text.match(/\b(\d+)\s*pack\b/i);
  if (packMatch) return parseInt(packMatch[1], 10);

  const wordMap: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const wordMatch = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)[- ]disc\b/i);
  if (wordMatch) return wordMap[wordMatch[1].toLowerCase()] ?? null;

  return null;
}

function attachPackageContext(payload: Record<string, any>, context: PackageContext) {
  const detectedFormats = dedupeFormats(
    context.detectedFormats.length > 0
      ? context.detectedFormats
      : (payload.detected_formats || []),
  );
  const productTitle = context.productTitle || payload.product_title || payload.barcode_title || payload.title || context.rawTitle;
  const barcodeTitle = context.rawTitle || payload.barcode_title || productTitle;
  const discCount = context.discCount ?? payload.disc_count ?? null;
  const digitalCodeExpected = context.digitalCodeExpected ?? payload.digital_code_expected ?? detectedFormats.includes("Digital");
  const slipcoverExpected = context.slipcoverExpected ?? payload.slipcover_expected ?? null;
  const packageImageUrl = context.packageImageUrl ?? payload.package_image_url ?? null;
  const editionLabel = context.editionLabel ?? payload.edition_label ?? null;

  return {
    ...payload,
    barcode_title: barcodeTitle,
    product_title: productTitle,
    detected_formats: detectedFormats,
    disc_count: discCount,
    digital_code_expected: digitalCodeExpected,
    slipcover_expected: slipcoverExpected,
    package_image_url: packageImageUrl,
    edition_label: editionLabel,
    tmdb_poster_url: payload.tmdb_poster_url || payload.poster_url || null,
  };
}

async function buildOverridePayload(override: BarcodeOverride, apiKey: string) {
  switch (override.kind) {
    case "movie": {
      const detail = await fetchTmdbMovieDetails(override.tmdbId, apiKey);
      return {
        ...detail,
        title: override.title,
        year: override.year,
        media_type: "movie",
        _matchScore: 260,
      };
    }
    case "multi_movie": {
      const multiMovies = await enrichMovieSummaries(
        override.movieTmdbIds.map((tmdbId) => ({
          tmdb_id: tmdbId,
          title: "",
          year: null,
          poster_url: null,
          overview: null,
        })),
        apiKey,
      );

      return {
        is_multi_movie: true,
        product_title: override.productTitle,
        collection_name: override.collectionName,
        media_type: "box_set",
        multi_movies: multiMovies,
        included_titles: multiMovies.map((movie: any) => ({
          title: movie.title,
          year: movie.year,
          tmdb_id: movie.tmdb_id,
        })),
        _matchScore: 260,
      };
    }
    case "tv_box_set": {
      const showDetail = await fetchShowSeasons(override.tmdbSeriesId, apiKey);
      const seasons = showDetail?.seasons?.filter((season) => override.seasonNumbers.includes(season.season_number)) || [];

      return {
        is_multi_season: true,
        product_title: override.productTitle,
        show_name: override.showName,
        tmdb_series_id: override.tmdbSeriesId,
        media_type: "tv_box_set",
        seasons,
        included_titles: seasons.map((season) => ({
          title: season.title,
          year: season.year,
          tmdb_id: override.tmdbSeriesId,
          season_number: season.season_number,
        })),
        _matchScore: 260,
      };
    }
  }
}

function mapMovieSummary(movie: any) {
  return {
    tmdb_id: movie.id ?? null,
    title: movie.title,
    year: movie.release_date ? parseInt(movie.release_date.slice(0, 4), 10) : null,
    poster_url: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
    overview: movie.overview || null,
  };
}

async function enrichMovieSummaries(movies: any[], apiKey: string) {
  return Promise.all(movies.map(async (movie) => {
    if (!movie?.tmdb_id) return movie;

    try {
      const detail = await fetchTmdbMovieDetails(movie.tmdb_id, apiKey);
      return {
        ...movie,
        ...detail,
        title: detail.title || movie.title,
        year: detail.year ?? movie.year ?? null,
        poster_url: detail.poster_url ?? movie.poster_url ?? null,
        overview: detail.overview || movie.overview || null,
      };
    } catch {
      return movie;
    }
  }));
}

function buildJsonResponse(payload: Record<string, any>, debugLog: { source: string; status: string; raw?: any }[]) {
  const { _matchScore, ...cleanPayload } = payload;

  return new Response(JSON.stringify({ ...cleanPayload, _debug: debugLog }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isStrongResolvedMatch(payload: Record<string, any> | null) {
  if (!payload) return false;
  return Boolean(
    payload.is_multi_movie ||
    payload.is_multi_season ||
    payload.media_type === "tv_season" ||
    (payload._matchScore || 0) >= 170,
  );
}

async function fetchTmdbMovieDetails(tmdbId: number, apiKey: string) {
  const [detailRes, creditsRes] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${apiKey}&language=en-US`),
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${apiKey}&language=en-US`),
  ]);

  const detail = await detailRes.json();
  const credits = creditsRes.ok ? await creditsRes.json() : {};

  const cast = (credits.cast || []).slice(0, 10).map((person: any) => ({
    name: person.name,
    character: person.character,
    profile_url: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
  }));
  const director = (credits.crew || []).filter((person: any) => person.job === "Director").map((person: any) => person.name);
  const writer = (credits.crew || []).filter((person: any) => person.job === "Writer" || person.job === "Screenplay").map((person: any) => person.name);
  const producer = (credits.crew || []).filter((person: any) => person.job === "Producer").map((person: any) => person.name);

  return {
    tmdb_id: detail.id,
    title: detail.title,
    year: detail.release_date ? parseInt(detail.release_date.slice(0, 4), 10) : null,
    poster_url: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
    genre: detail.genres?.map((genre: any) => genre.name).join(", ") || null,
    rating: detail.vote_average || null,
    overview: detail.overview || null,
    runtime: detail.runtime || null,
    tagline: detail.tagline || null,
    media_type: "movie",
    cast,
    crew: { director, writer, producer },
  };
}

async function fetchTmdbTvDetails(tmdbId: number, apiKey: string) {
  const [detailRes, creditsRes] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${apiKey}&language=en-US`),
    fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/credits?api_key=${apiKey}&language=en-US`),
  ]);

  const detail = await detailRes.json();
  const credits = creditsRes.ok ? await creditsRes.json() : {};

  const cast = (credits.cast || []).slice(0, 10).map((person: any) => ({
    name: person.name,
    character: person.character,
    profile_url: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
  }));
  const director = (credits.crew || []).filter((person: any) => person.job === "Director").map((person: any) => person.name);
  const writer = (credits.crew || []).filter((person: any) => person.job === "Writer" || person.job === "Screenplay").map((person: any) => person.name);
  const producer = (credits.crew || []).filter((person: any) => person.job === "Producer").map((person: any) => person.name);

  return {
    tmdb_id: detail.id,
    title: detail.name,
    year: detail.first_air_date ? parseInt(detail.first_air_date.slice(0, 4), 10) : null,
    poster_url: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
    genre: detail.genres?.map((genre: any) => genre.name).join(", ") || null,
    rating: detail.vote_average || null,
    overview: detail.overview || null,
    runtime: detail.episode_run_time?.[0] || null,
    tagline: detail.tagline || null,
    media_type: "tv",
    cast,
    crew: { director, writer, producer },
  };
}

async function searchTmdbMovie(query: string, apiKey: string, year?: number | null) {
  let url = `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
  if (year) url += `&year=${year}`;

  const response = await fetch(url);
  const data = await response.json();
  return data.results || [];
}

async function searchTmdbTv(query: string, apiKey: string, yearHint?: number | null) {
  const url = `https://api.themoviedb.org/3/search/tv?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&page=1`;
  const response = await fetch(url);
  const data = await response.json();
  const results = data.results || [];

  if (results.length === 0) return results;

  const normalizedQuery = query.toLowerCase().trim();

  return results.slice().sort((left: any, right: any) => {
    const score = (show: any) => {
      let value = 0;
      const normalizedName = (show.name || "").toLowerCase();

      if (normalizedName === normalizedQuery) value += 1000;
      else if (normalizedName.startsWith(normalizedQuery)) value += 400;
      else if (normalizedName.includes(normalizedQuery)) value += 150;

      value += Math.min(300, show.popularity || 0);
      value += Math.min(200, Math.log10((show.vote_count || 0) + 1) * 40);

      if (yearHint && show.first_air_date) {
        const resultYear = parseInt(show.first_air_date.slice(0, 4), 10);
        if (Number.isFinite(resultYear) && Math.abs(resultYear - yearHint) <= 2) value += 120;
      }

      return value;
    };

    return score(right) - score(left);
  });
}

async function fetchShowSeasons(tmdbSeriesId: number, apiKey: string) {
  const response = await fetch(
    `https://api.themoviedb.org/3/tv/${tmdbSeriesId}?api_key=${apiKey}&language=en-US`,
  );

  if (!response.ok) return null;

  const detail = await response.json();
  const rawSeasons = (detail.seasons || []) as any[];
  const hasRealSeasons = rawSeasons.some((season) => season.season_number > 0);
  const seasons = hasRealSeasons ? rawSeasons.filter((season) => season.season_number > 0) : rawSeasons;

  return {
    show: detail,
    seasons: seasons.map((season) => ({
      tmdb_series_id: tmdbSeriesId,
      season_number: season.season_number,
      title: `${detail.name} - Season ${season.season_number}`,
      year: season.air_date ? parseInt(season.air_date.slice(0, 4), 10) : (detail.first_air_date ? parseInt(detail.first_air_date.slice(0, 4), 10) : null),
      poster_url: season.poster_path ? `https://image.tmdb.org/t/p/w500${season.poster_path}` : (detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null),
      overview: season.overview || detail.overview || null,
      episode_count: season.episode_count || null,
    })),
  };
}

async function buildTvSeasonPayload(show: any, seasonNumber: number, apiKey: string, rawTitle: string, detectedFormats: string[]) {
  try {
    const seasonResponse = await fetch(
      `https://api.themoviedb.org/3/tv/${show.id}/season/${seasonNumber}?api_key=${apiKey}&language=en-US`,
    );

    if (seasonResponse.ok) {
      const season = await seasonResponse.json();
      return {
        tmdb_id: show.id,
        tmdb_series_id: show.id,
        season_number: seasonNumber,
        series_title: show.name,
        title: `${show.name} - Season ${seasonNumber}`,
        year: season.air_date ? parseInt(season.air_date.slice(0, 4), 10) : (show.first_air_date ? parseInt(show.first_air_date.slice(0, 4), 10) : null),
        poster_url: season.poster_path ? `https://image.tmdb.org/t/p/w500${season.poster_path}` : (show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null),
        rating: show.vote_average || null,
        overview: season.overview || show.overview || null,
        media_type: "tv_season",
        episode_count: season.episodes?.length || season.episode_count || null,
        barcode_title: rawTitle,
        detected_formats: detectedFormats,
        _matchScore: 200,
      };
    }
  } catch {
    // Fall through to show-level fallback below.
  }

  return {
    tmdb_id: show.id,
    tmdb_series_id: show.id,
    season_number: seasonNumber,
    series_title: show.name,
    title: `${show.name} - Season ${seasonNumber}`,
    year: show.first_air_date ? parseInt(show.first_air_date.slice(0, 4), 10) : null,
    poster_url: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
    rating: show.vote_average || null,
    overview: show.overview || null,
    media_type: "tv_season",
    barcode_title: rawTitle,
    detected_formats: detectedFormats,
    _matchScore: 185,
  };
}

async function resolveBestMovieMatch(cleanTitle: string, rawTitle: string, apiKey: string, barcodeYear?: number | null) {
  const candidates = generateTitleCandidates(rawTitle, cleanTitle);
  let bestMatch: { movie: any; score: number } | null = null;

  for (const candidate of candidates) {
    const deduped = new Map<number, any>();
    const [yearMatches, generalMatches] = await Promise.all([
      barcodeYear ? searchTmdbMovie(candidate, apiKey, barcodeYear) : Promise.resolve([]),
      searchTmdbMovie(candidate, apiKey),
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

function pickCollectionParts(parts: any[], requestedTitles: string[]) {
  if (requestedTitles.length === 0) return parts.map(mapMovieSummary);

  const usedPartIds = new Set<number>();

  return requestedTitles.map((requestedTitle) => {
    let bestPart: any = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const part of parts) {
      if (usedPartIds.has(part.id)) continue;
      const score = scoreMovieResult(requestedTitle, part);
      if (score > bestScore) {
        bestPart = part;
        bestScore = score;
      }
    }

    if (bestPart && bestScore >= 65) {
      usedPartIds.add(bestPart.id);
      return mapMovieSummary(bestPart);
    }

    return {
      tmdb_id: null,
      title: requestedTitle,
      year: null,
      poster_url: null,
      overview: null,
    };
  });
}

async function searchTmdbCollection(query: string, apiKey: string) {
  const response = await fetch(
    `https://api.themoviedb.org/3/search/collection?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US`,
  );
  const data = await response.json();
  return data.results || [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tmdbApiKey = Deno.env.get("TMDB_API_KEY") || "";
    if (!tmdbApiKey) throw new Error("TMDB_API_KEY not configured");

    const { query, year, tmdb_id: tmdbId, search_type: searchType, barcode, get_posters: getPosters } = await req.json();

    if (getPosters && tmdbId) {
      const type = searchType === "tv" || searchType === "tv_season" ? "tv" : "movie";
      const imageResponse = await fetch(
        `https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=${tmdbApiKey}&include_image_language=en,null`,
      );
      const imageData = await imageResponse.json();
      const posters = (imageData.posters || []).map((poster: any) => ({
        poster_url: `https://image.tmdb.org/t/p/w500${poster.file_path}`,
        width: poster.width,
        height: poster.height,
        language: poster.iso_639_1,
        vote_average: poster.vote_average,
      }));

      return new Response(JSON.stringify({ posters }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (barcode) {
      async function processBarcodeTitle(cleanTitle: string, rawTitle: string, detectedFormats: string[], barcodeYear?: number | null) {
        const tvIndicator = parseTvIndicator(cleanTitle);

        if (tvIndicator.kind === "complete" || tvIndicator.kind === "range") {
          const showName = tvIndicator.showName || cleanTitle;
          const tvResults = await searchTmdbTv(showName, tmdbApiKey, barcodeYear);
          if (tvResults.length > 0) {
            const show = tvResults[0];
            const showDetail = await fetchShowSeasons(show.id, tmdbApiKey);
            if (showDetail && showDetail.seasons.length > 0) {
              const seasons = tvIndicator.kind === "range" && tvIndicator.from != null && tvIndicator.to != null
                ? showDetail.seasons.filter((season) => season.season_number >= tvIndicator.from! && season.season_number <= tvIndicator.to!)
                : showDetail.seasons;

              if (seasons.length > 0) {
                return {
                  is_multi_season: true,
                  product_title: cleanTitle || rawTitle,
                  barcode_title: rawTitle,
                  detected_formats: detectedFormats,
                  show_name: showDetail.show.name,
                  tmdb_series_id: show.id,
                  media_type: "tv_box_set",
                  _matchScore: 235,
                  seasons,
                  included_titles: seasons.map((season) => ({
                    title: season.title,
                    year: season.year,
                    tmdb_id: show.id,
                    season_number: season.season_number,
                  })),
                };
              }
            }
          }
        }

        if (tvIndicator.kind === "single" && tvIndicator.seasonNum != null) {
          const showName = tvIndicator.showName || cleanTitle;
          const tvResults = await searchTmdbTv(showName, tmdbApiKey, barcodeYear);
          if (tvResults.length > 0) {
            return buildTvSeasonPayload(tvResults[0], tvIndicator.seasonNum, tmdbApiKey, rawTitle, detectedFormats);
          }
        }

        const hasSlash = cleanTitle.includes("/");
        const hasMultiKeyword = MULTI_MOVIE_KEYWORDS.test(cleanTitle);

        if (hasSlash || hasMultiKeyword) {
          const movieTitles = hasSlash ? expandSharedFranchiseTitles(splitMultiTitleCandidates(cleanTitle)) : [];
          const franchiseName = extractCollectionFranchiseName(cleanTitle);
          const collectionQueries = Array.from(new Set([cleanTitle, franchiseName, rawTitle].filter(Boolean)));

          for (const collectionQuery of collectionQueries) {
            const collections = await searchTmdbCollection(collectionQuery, tmdbApiKey);
            if (collections.length === 0) continue;

            const rankedCollection = collections
              .map((collection: any) => ({
                collection,
                score: scoreCollectionMatch(franchiseName || cleanTitle, collection.name || ""),
              }))
              .sort((left: any, right: any) => right.score - left.score)[0];

            if (!rankedCollection || rankedCollection.score < 65) continue;

            const collectionDetailResponse = await fetch(
              `https://api.themoviedb.org/3/collection/${rankedCollection.collection.id}?api_key=${tmdbApiKey}&language=en-US`,
            );
            const collectionDetail = await collectionDetailResponse.json();

            if (collectionDetail.parts?.length > 0) {
              const multiMovies = await enrichMovieSummaries(
                pickCollectionParts(collectionDetail.parts, movieTitles),
                tmdbApiKey,
              );
              return {
                is_multi_movie: true,
                product_title: cleanTitle || rawTitle,
                barcode_title: rawTitle,
                detected_formats: detectedFormats,
                collection_name: collectionDetail.name,
                media_type: "box_set",
                _matchScore: 220,
                multi_movies: multiMovies,
                included_titles: multiMovies.map((movie: any) => ({
                  title: movie.title,
                  year: movie.year,
                  tmdb_id: movie.tmdb_id,
                })),
              };
            }
          }

          if (movieTitles.length > 1) {
            const multiMovies = [];
            for (const movieTitle of movieTitles) {
              const bestMovieMatch = await resolveBestMovieMatch(movieTitle, movieTitle, tmdbApiKey, barcodeYear);
              if (bestMovieMatch) {
                multiMovies.push(mapMovieSummary(bestMovieMatch.movie));
              } else {
                multiMovies.push({
                  tmdb_id: null,
                  title: movieTitle,
                  year: null,
                  poster_url: null,
                  overview: null,
                });
              }
            }

            const enrichedMovies = await enrichMovieSummaries(multiMovies, tmdbApiKey);

            return {
              is_multi_movie: true,
              product_title: cleanTitle || rawTitle,
              barcode_title: rawTitle,
              detected_formats: detectedFormats,
              media_type: "box_set",
              _matchScore: 210,
              multi_movies: enrichedMovies,
              included_titles: enrichedMovies.map((movie: any) => ({
                title: movie.title,
                year: movie.year,
                tmdb_id: movie.tmdb_id,
              })),
            };
          }
        }

        if (cleanTitle) {
          const bestMovieMatch = await resolveBestMovieMatch(cleanTitle, rawTitle, tmdbApiKey, barcodeYear);
          if (bestMovieMatch && bestMovieMatch.score >= 70) {
            const detail = await fetchTmdbMovieDetails(bestMovieMatch.movie.id, tmdbApiKey);
            return { ...detail, barcode_title: rawTitle, detected_formats: detectedFormats, _matchScore: bestMovieMatch.score };
          }

          const tvResults = await searchTmdbTv(cleanTitle, tmdbApiKey, barcodeYear);
          if (tvResults.length > 0) {
            const show = tvResults[0];
            return {
              tmdb_id: show.id,
              title: show.name,
              year: show.first_air_date ? parseInt(show.first_air_date.slice(0, 4), 10) : null,
              poster_url: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
              rating: show.vote_average || null,
              overview: show.overview || null,
              media_type: "tv",
              barcode_title: rawTitle,
              detected_formats: detectedFormats,
              _matchScore: 110,
            };
          }

          return { title: cleanTitle || rawTitle, barcode_title: rawTitle, detected_formats: detectedFormats, _matchScore: 10 };
        }

        return null;
      }

      const debugLog: { source: string; status: string; raw?: any }[] = [];
      const barcodeOverride = BARCODE_OVERRIDES[barcode];
      let upcTitle = "";
      let upcCleanTitle = "";
      let upcFormats: string[] = [];
      let barcodeYear: number | null = null;
      let bestResolved: Record<string, any> | null = null;
      let packageContext: PackageContext = {
        rawTitle: "",
        productTitle: "",
        detectedFormats: [],
      };

      const considerResolved = (resolved: Record<string, any> | null) => {
        if (!resolved) return false;
        if (!bestResolved || (resolved._matchScore || 0) > (bestResolved._matchScore || 0)) {
          bestResolved = resolved;
        }
        return isStrongResolvedMatch(resolved);
      };

      try {
        const upcResponse = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`);
        const upcRaw = upcResponse.ok ? await upcResponse.json() : null;

        if (upcRaw?.items?.length > 0) {
          const upcItem = upcRaw.items[0];
          upcTitle = upcItem.title || "";
          upcFormats = detectFormats(upcTitle);
          upcCleanTitle = cleanProductTitle(upcTitle);
          if (!barcodeYear) barcodeYear = extractYearFromText(upcTitle);
          packageContext = {
            rawTitle: upcTitle,
            productTitle: upcTitle,
            detectedFormats: upcFormats,
            discCount: extractDiscCount(`${upcTitle} ${upcItem.description || ""}`),
            packageImageUrl: Array.isArray(upcItem.images) && upcItem.images.length > 0 ? upcItem.images[0] : null,
          };

          debugLog.push({ source: "UPCitemdb", status: "HIT", raw: { title: upcTitle, category: upcItem.category, brand: upcItem.brand } });

          if (barcodeOverride) {
            const overrideContext: PackageContext = {
              ...packageContext,
              productTitle: barcodeOverride.kind === "movie" ? barcodeOverride.packageTitle : barcodeOverride.productTitle,
              detectedFormats: barcodeOverride.formats,
              discCount: barcodeOverride.discCount,
              editionLabel: barcodeOverride.editionLabel || null,
              digitalCodeExpected: barcodeOverride.digitalCodeExpected ?? null,
              slipcoverExpected: barcodeOverride.slipcoverExpected ?? null,
            };
            const overridePayload = attachPackageContext(await buildOverridePayload(barcodeOverride, tmdbApiKey), overrideContext);
            debugLog.push({ source: "BarcodeOverride", status: "HIT", raw: { kind: barcodeOverride.kind, productTitle: overrideContext.productTitle } });
            return buildJsonResponse(overridePayload, debugLog);
          }

          if (upcCleanTitle) {
            const result = await processBarcodeTitle(upcCleanTitle, upcTitle, upcFormats, barcodeYear);
            const packagedResult = result ? attachPackageContext(result, packageContext) : null;
            if (considerResolved(packagedResult)) return buildJsonResponse(packagedResult!, debugLog);
          }
        } else {
          debugLog.push({ source: "UPCitemdb", status: "MISS", raw: upcRaw });
        }
      } catch (error) {
        debugLog.push({ source: "UPCitemdb", status: "ERROR", raw: String(error) });
      }

      if (barcodeOverride) {
        const fallbackContext: PackageContext = {
          ...packageContext,
          rawTitle: packageContext.rawTitle || (barcodeOverride.kind === "movie" ? barcodeOverride.packageTitle : barcodeOverride.productTitle),
          productTitle: barcodeOverride.kind === "movie" ? barcodeOverride.packageTitle : barcodeOverride.productTitle,
          detectedFormats: barcodeOverride.formats,
          discCount: barcodeOverride.discCount,
          editionLabel: barcodeOverride.editionLabel || null,
          digitalCodeExpected: barcodeOverride.digitalCodeExpected ?? null,
          slipcoverExpected: barcodeOverride.slipcoverExpected ?? null,
        };
        const overridePayload = attachPackageContext(await buildOverridePayload(barcodeOverride, tmdbApiKey), fallbackContext);
        debugLog.push({ source: "BarcodeOverride", status: "HIT-fallback", raw: { kind: barcodeOverride.kind, productTitle: fallbackContext.productTitle } });
        return buildJsonResponse(overridePayload, debugLog);
      }

      try {
        const openLibraryResponse = await fetch(
          `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(barcode)}&format=json&jscmd=data`,
        );
        const openLibraryRaw = openLibraryResponse.ok ? await openLibraryResponse.json() : null;
        const openLibraryKey = openLibraryRaw ? Object.keys(openLibraryRaw)[0] : null;

        if (openLibraryKey && openLibraryRaw[openLibraryKey]?.title) {
          const openLibraryTitle = openLibraryRaw[openLibraryKey].title;
          const openLibraryCleanTitle = cleanProductTitle(openLibraryTitle);
          const openLibraryFormats = upcFormats.length > 0 ? upcFormats : [];
          debugLog.push({ source: "OpenLibrary", status: "HIT", raw: { title: openLibraryTitle } });

          if (openLibraryCleanTitle) {
            const result = await processBarcodeTitle(openLibraryCleanTitle, openLibraryTitle, openLibraryFormats, barcodeYear);
            const packagedResult = result ? attachPackageContext(result, {
              ...packageContext,
              rawTitle: packageContext.rawTitle || openLibraryTitle,
              productTitle: packageContext.productTitle || openLibraryTitle,
              detectedFormats: openLibraryFormats,
            }) : null;
            if (considerResolved(packagedResult)) return buildJsonResponse(packagedResult!, debugLog);
          }
        } else {
          debugLog.push({ source: "OpenLibrary", status: "MISS", raw: openLibraryRaw });
        }
      } catch (error) {
        debugLog.push({ source: "OpenLibrary", status: "ERROR", raw: String(error) });
      }

      try {
        const findResponse = await fetch(
          `https://api.themoviedb.org/3/find/${encodeURIComponent(barcode)}?api_key=${tmdbApiKey}&external_source=upc&language=en-US`,
        );
        const findRaw = findResponse.ok ? await findResponse.json() : null;
        const movieResults = findRaw?.movie_results || [];
        const tvResults = findRaw?.tv_results || [];

        if (movieResults.length > 0) {
          const detail = await fetchTmdbMovieDetails(movieResults[0].id, tmdbApiKey);
          debugLog.push({ source: "TMDB-UPC", status: "HIT-movie", raw: { id: movieResults[0].id, title: movieResults[0].title } });
          return buildJsonResponse(attachPackageContext({
            ...detail,
            barcode_title: movieResults[0].title,
            detected_formats: upcFormats,
            _matchScore: 250,
          }, packageContext), debugLog);
        }

        if (tvResults.length > 0) {
          const tv = tvResults[0];
          debugLog.push({ source: "TMDB-UPC", status: "HIT-tv", raw: { id: tv.id, title: tv.name } });
          return buildJsonResponse(attachPackageContext({
            tmdb_id: tv.id,
            title: tv.name,
            year: tv.first_air_date ? parseInt(tv.first_air_date.slice(0, 4), 10) : null,
            poster_url: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : null,
            rating: tv.vote_average || null,
            overview: tv.overview || null,
            media_type: "tv",
            barcode_title: tv.name,
            detected_formats: upcFormats,
            _matchScore: 230,
          }, packageContext), debugLog);
        }

        debugLog.push({ source: "TMDB-UPC", status: "MISS", raw: findRaw });
      } catch (error) {
        debugLog.push({ source: "TMDB-UPC", status: "ERROR", raw: String(error) });
      }

      if (upcCleanTitle) {
        const fuzzyResult = await processBarcodeTitle(upcCleanTitle, upcTitle || upcCleanTitle, upcFormats, barcodeYear);
        if (fuzzyResult) {
          const packagedFuzzyResult = attachPackageContext(fuzzyResult, packageContext);
          debugLog.push({
            source: "TMDB-fuzzy",
            status: (packagedFuzzyResult._matchScore || 0) >= 70 ? "HIT" : "PARTIAL",
            raw: { query: upcCleanTitle, score: packagedFuzzyResult._matchScore || 0 },
          });
          considerResolved(packagedFuzzyResult);
        } else {
          debugLog.push({ source: "TMDB-fuzzy", status: "MISS-noresults", raw: { query: upcCleanTitle } });
        }
      }

      if (bestResolved) return buildJsonResponse(bestResolved, debugLog);

      debugLog.push({ source: "ALL", status: "FAILED" });
      return new Response(JSON.stringify({
        barcode_not_found: true,
        barcode_value: barcode,
        title: "",
        detected_formats: [],
        _debug: debugLog,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tmdbId) {
      const payload = searchType === "tv" || searchType === "tv_season"
        ? await fetchTmdbTvDetails(tmdbId, tmdbApiKey)
        : await fetchTmdbMovieDetails(tmdbId, tmdbApiKey);

      return new Response(JSON.stringify(payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!query) throw new Error("Either 'query', 'tmdb_id', or 'barcode' is required");

    const results: any[] = [];

    if (searchType !== "tv") {
      const movieResults = await searchTmdbMovie(query, tmdbApiKey, year || null);
      for (const movie of movieResults.slice(0, 10)) {
        results.push({
          tmdb_id: movie.id,
          title: movie.title,
          year: movie.release_date ? parseInt(movie.release_date.slice(0, 4), 10) : null,
          poster_url: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
          rating: movie.vote_average || null,
          overview: movie.overview || null,
          media_type: "movie",
        });
      }
    }

    if (searchType !== "movie") {
      let tvResults = await searchTmdbTv(query, tmdbApiKey, year || null);
      if (year) {
        const filteredResponse = await fetch(
          `https://api.themoviedb.org/3/search/tv?api_key=${tmdbApiKey}&query=${encodeURIComponent(query)}&language=en-US&page=1&first_air_date_year=${year}`,
        );
        const filteredData = await filteredResponse.json();
        if ((filteredData.results || []).length > 0) tvResults = filteredData.results;
      }

      for (const show of tvResults.slice(0, 10)) {
        results.push({
          tmdb_id: show.id,
          title: show.name,
          year: show.first_air_date ? parseInt(show.first_air_date.slice(0, 4), 10) : null,
          poster_url: show.poster_path ? `https://image.tmdb.org/t/p/w500${show.poster_path}` : null,
          rating: show.vote_average || null,
          overview: show.overview || null,
          media_type: "tv",
        });
      }
    }

    const queryIndicator = parseTvIndicator(query);
    if (queryIndicator.kind === "single" && queryIndicator.seasonNum != null) {
      const tvResults = await searchTmdbTv(queryIndicator.showName || query, tmdbApiKey, year || null);
      if (tvResults.length > 0) {
        const payload = await buildTvSeasonPayload(tvResults[0], queryIndicator.seasonNum, tmdbApiKey, query, []);
        results.unshift({
          tmdb_id: payload.tmdb_id,
          tmdb_series_id: payload.tmdb_series_id,
          season_number: payload.season_number,
          series_title: payload.series_title,
          title: payload.title,
          year: payload.year,
          poster_url: payload.poster_url,
          rating: payload.rating,
          overview: payload.overview,
          media_type: payload.media_type,
          episode_count: payload.episode_count || null,
        });
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
