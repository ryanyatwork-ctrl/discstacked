import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { searchTmdb } from "@/lib/tmdb";
import { useQueryClient } from "@tanstack/react-query";
import type { DbMediaItem } from "@/hooks/useMediaItems";
import { hasManualArtworkOverride } from "@/lib/cover-utils";

interface ArtworkResult {
  poster_url: string;
  source: string;
  match_type: "exact_owned_cover" | "generic_content_poster";
}

function getEditionMeta(item: DbMediaItem) {
  const meta = (item.metadata as Record<string, any>) || {};
  return (meta.edition as Record<string, any>) || {};
}

async function canLoadImage(url: string): Promise<boolean> {
  if (!url) return false;

  return await new Promise<boolean>((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// ── Barcode lookup via tmdb-lookup edge function ──
async function lookupByBarcode(barcode: string): Promise<ArtworkResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
      body: { barcode },
    });
    if (error || !data) return null;
    const posterUrl = data.package_image_url || data.poster_url || data.results?.[0]?.package_image_url || data.results?.[0]?.poster_url;
    if (posterUrl) return { poster_url: posterUrl, source: "matched by barcode", match_type: "exact_owned_cover" };
    return null;
  } catch {
    return null;
  }
}

// ── Title search via TMDB ──
async function lookupByTitle(
  title: string,
  year?: number,
  preferTv?: boolean
): Promise<ArtworkResult | null> {
  try {
    const primary = preferTv ? "tv" : "movie";
    const secondary = preferTv ? "movie" : "tv";

    let results = await searchTmdb(title, year, primary);
    if (!results.length || !results[0].poster_url) {
      results = await searchTmdb(title, year, secondary);
    }
    if (results.length > 0 && results[0].poster_url) {
      return { poster_url: results[0].poster_url, source: `matched by title search (${primary})`, match_type: "generic_content_poster" };
    }
    return null;
  } catch {
    return null;
  }
}

// ── TMDB TV season-specific poster ──
async function lookupTvSeasonPoster(
  seriesTitle: string,
  seasonNumber: number,
  tmdbSeriesId?: number
): Promise<ArtworkResult | null> {
  try {
    // If we have a TMDB series ID, use it directly
    let showId = tmdbSeriesId;
    if (!showId) {
      const results = await searchTmdb(seriesTitle, undefined, "tv");
      if (!results.length) return null;
      showId = results[0].tmdb_id;
    }
    // Fetch season-specific data which includes season poster
    const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
      body: { query: `${seriesTitle}: Season ${seasonNumber}` },
    });
    if (error || !data?.results?.length) return null;
    // Look for tv_season type result first
    const seasonResult = data.results.find((r: any) => r.media_type === "tv_season" && r.poster_url);
    if (seasonResult?.poster_url) {
      return { poster_url: seasonResult.poster_url, source: "matched by TV season poster", match_type: "exact_owned_cover" };
    }
    // Any result with a poster as fallback
    const anyPoster = data.results.find((r: any) => r.poster_url);
    if (anyPoster?.poster_url) {
      return { poster_url: anyPoster.poster_url, source: "matched by TV series poster (season fallback)", match_type: "generic_content_poster" };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Game cover lookup ──
async function fetchGameCover(title: string): Promise<ArtworkResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("game-lookup", {
      body: { query: title },
    });
    if (error || !data?.results?.length) return null;
    const best = data.results[0];
    if (!best.cover_url) return null;
    return { poster_url: best.cover_url, source: "matched by game lookup", match_type: "exact_owned_cover" };
  } catch {
    return null;
  }
}

// ── Music cover lookup ──
async function fetchMusicCover(title: string, barcode?: string): Promise<ArtworkResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("music-lookup", {
      body: { query: title, barcode },
    });
    if (error) return null;
    const coverUrl = data?.poster_url || data?.results?.[0]?.cover_url;
    if (coverUrl) return { poster_url: coverUrl, source: barcode ? "matched by music barcode" : "matched by music title", match_type: barcode ? "exact_owned_cover" : "generic_content_poster" };
    return null;
  } catch {
    return null;
  }
}

// ── Metadata extraction helpers ──
function getBarcode(item: DbMediaItem): string | null {
  return item.barcode || null;
}

function getEditionTitle(item: DbMediaItem): string | null {
  const meta = item.metadata as Record<string, any> | null;
  return meta?.edition?.barcode_title || meta?.edition?.package_title || null;
}

function getContentType(item: DbMediaItem): string | null {
  const meta = item.metadata as Record<string, any> | null;
  return meta?.content_type || meta?.media_type || null;
}

function getIncludedTitles(item: DbMediaItem): string[] {
  const meta = item.metadata as Record<string, any> | null;
  const titles = meta?.included_titles;
  if (!Array.isArray(titles)) return [];
  return titles.map((t: any) => (typeof t === "string" ? t : t?.title)).filter(Boolean);
}

function getSeriesInfo(item: DbMediaItem): { seriesTitle?: string; seasonNumber?: number; tmdbSeriesId?: number } | null {
  const meta = item.metadata as Record<string, any> | null;
  if (!meta) return null;
  const seriesTitle = meta.series_title || meta.show_name;
  const seasonNumber = meta.season_number;
  const tmdbSeriesId = meta.tmdb_series_id;
  if (seriesTitle || seasonNumber) return { seriesTitle, seasonNumber, tmdbSeriesId };
  return null;
}

/**
 * Resolve artwork for a single item using saved metadata in priority order:
 * A. barcode/UPC → exact_owned_cover
 * B. edition/package title (full, not stripped) → exact_owned_cover
 * C. TV season: series + season number → season-specific poster
 * D. box set: package title + included_titles
 * E. canonical title + year → generic_content_poster
 * F. fallback text search → generic_content_poster
 */
async function resolveArtwork(item: DbMediaItem): Promise<ArtworkResult | null> {
  const contentType = getContentType(item);
  const isTvSeason = contentType === "tv_season" || item.title.toLowerCase().includes("season");
  const isBoxSet = contentType === "box_set";

  // Games use their own lookup
  if (item.media_type === "games") {
    return fetchGameCover(item.title);
  }

  // CDs use music lookup
  if (item.media_type === "cds") {
    const barcode = getBarcode(item);
    return fetchMusicCover(item.title, barcode || undefined);
  }

  // ── A. Barcode lookup (highest priority — exact owned cover) ──
  const barcode = getBarcode(item);
  if (barcode) {
    const result = await lookupByBarcode(barcode);
    if (result) return result;
  }

  // ── B. Edition/package title lookup (full title, not stripped) ──
  const editionTitle = getEditionTitle(item);
  if (editionTitle && editionTitle !== item.title) {
    // First try with the FULL package title (preserving "Complete Third Season" etc.)
    const result = await lookupByTitle(editionTitle, undefined, isTvSeason);
    if (result) return { ...result, source: "matched by package title", match_type: "exact_owned_cover" };
  }

  // ── C. TV season: use series info for season-specific poster ──
  if (isTvSeason) {
    const seriesInfo = getSeriesInfo(item);
    if (seriesInfo?.seriesTitle && seriesInfo?.seasonNumber) {
      const seasonResult = await lookupTvSeasonPoster(
        seriesInfo.seriesTitle,
        seriesInfo.seasonNumber,
        seriesInfo.tmdbSeriesId
      );
      if (seasonResult) return seasonResult;
    }
    // Try the full title as-is (e.g. "X-Men: Evolution: The Complete Third Season")
    const fullTitleResult = await lookupByTitle(item.title, undefined, true);
    if (fullTitleResult) return { ...fullTitleResult, source: "matched by full TV season title", match_type: "exact_owned_cover" };

    // Try extracting show name from title patterns like "Show: The Complete Nth Season"
    const seasonPattern = /^(.+?):\s*(?:The\s+)?(?:Complete\s+)?\w+\s+Season$/i;
    const seasonMatch = item.title.match(seasonPattern);
    if (seasonMatch) {
      const showName = seasonMatch[1].trim();
      const tvResult = await lookupByTitle(showName, undefined, true);
      if (tvResult) return { ...tvResult, source: "matched by extracted series name (generic)", match_type: "generic_content_poster" };
    }
  }

  // ── D. Box set: package title, then included titles ──
  if (isBoxSet) {
    // Try canonical title as the box set package
    const result = await lookupByTitle(item.title, item.year ?? undefined, false);
    if (result) return { ...result, source: "matched by box set package title", match_type: "exact_owned_cover" };

    // Try first included title as fallback for set cover
    const included = getIncludedTitles(item);
    if (included.length > 0) {
      const firstResult = await lookupByTitle(included[0], undefined, false);
      if (firstResult) return { ...firstResult, source: "matched by box set included title", match_type: "generic_content_poster" };
    }
    return null;
  }

  // ── E. Canonical title + year + media_type ──
  const preferTv = isTvSeason || item.title.toLowerCase().includes("season");
  const result = await lookupByTitle(item.title, item.year ?? undefined, preferTv);
  if (result) return { ...result, source: "matched by canonical TMDB title", match_type: "generic_content_poster" };

  // ── F. Fallback: title without year ──
  if (item.year) {
    const fallback = await lookupByTitle(item.title, undefined, preferTv);
    if (fallback) return { ...fallback, source: "fallback text search", match_type: "generic_content_poster" };
  }

  return null;
}

async function findRepairCandidates(items: DbMediaItem[]) {
  const candidates: DbMediaItem[] = [];

  for (const item of items) {
    if (item.poster_url && hasManualArtworkOverride(item.metadata)) {
      continue;
    }

    const edition = getEditionMeta(item);
    const hasBrokenPoster = item.poster_url ? !(await canLoadImage(item.poster_url)) : false;
    const hasFallbackPoster = !!edition.tmdb_poster_url;
    const packagePosterNeedsFallback =
      !!item.poster_url &&
      !!edition.cover_art_url &&
      item.poster_url === edition.cover_art_url &&
      hasBrokenPoster &&
      hasFallbackPoster;

    if (!item.poster_url || hasBrokenPoster || packagePosterNeedsFallback) {
      candidates.push(item);
    }
  }

  return candidates;
}

export function useFetchArtwork() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, found: 0 });
  const queryClient = useQueryClient();

  const fetchArtwork = useCallback(async (items: DbMediaItem[]) => {
    const candidates = await findRepairCandidates(items);
    if (candidates.length === 0) return { found: 0, total: 0 };

    setIsRunning(true);
    setProgress({ done: 0, total: candidates.length, found: 0 });
    let found = 0;

    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      try {
        const edition = getEditionMeta(item);
        const isBrokenPackageCover =
          !!item.poster_url &&
          !!edition.cover_art_url &&
          item.poster_url === edition.cover_art_url &&
          !!edition.tmdb_poster_url;

        const artworkResult = isBrokenPackageCover
          ? {
              poster_url: edition.tmdb_poster_url,
              source: "repaired from TMDB fallback poster",
              match_type: "generic_content_poster" as const,
            }
          : await resolveArtwork(item);

        if (artworkResult?.poster_url) {
          const currentMeta = (item.metadata as Record<string, any>) || {};
          const { error } = await supabase
            .from("media_items")
            .update({
              poster_url: artworkResult.poster_url,
              metadata: {
                ...currentMeta,
                artwork_source: artworkResult.source,
                artwork_match_type: artworkResult.match_type,
              },
            })
            .eq("id", item.id);
          if (!error) found++;
        }
      } catch {
        // Skip failed lookups silently
      }

      setProgress({ done: i + 1, total: candidates.length, found });

      if (i < candidates.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    setIsRunning(false);
    queryClient.invalidateQueries({ queryKey: ["media_items"] });
    return { found, total: candidates.length };
  }, [queryClient]);

  return { fetchArtwork, isRunning, progress };
}
