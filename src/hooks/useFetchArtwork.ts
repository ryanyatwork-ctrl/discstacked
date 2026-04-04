import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { searchTmdb } from "@/lib/tmdb";
import { useQueryClient } from "@tanstack/react-query";
import type { DbMediaItem } from "@/hooks/useMediaItems";

interface ArtworkResult {
  poster_url: string;
  source: string;
}

/** Try barcode lookup via tmdb-lookup edge function */
async function lookupByBarcode(barcode: string): Promise<ArtworkResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
      body: { barcode },
    });
    if (error || !data) return null;
    const posterUrl = data.poster_url || data.results?.[0]?.poster_url;
    if (posterUrl) return { poster_url: posterUrl, source: "matched by barcode" };
    return null;
  } catch {
    return null;
  }
}

/** Try searching by a specific title string (edition/package title) */
async function lookupByTitle(
  title: string,
  year?: number,
  preferTv?: boolean
): Promise<ArtworkResult | null> {
  try {
    // Try movie first (or TV first if preferred)
    const primary = preferTv ? "tv" : "movie";
    const secondary = preferTv ? "movie" : "tv";

    let results = await searchTmdb(title, year, primary);
    if (!results.length || !results[0].poster_url) {
      results = await searchTmdb(title, year, secondary);
    }
    if (results.length > 0 && results[0].poster_url) {
      return { poster_url: results[0].poster_url, source: `matched by title search (${primary})` };
    }
    return null;
  } catch {
    return null;
  }
}

/** Try game cover lookup */
async function fetchGameCover(title: string): Promise<ArtworkResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("game-lookup", {
      body: { query: title },
    });
    if (error || !data?.results?.length) return null;
    const best = data.results[0];
    if (!best.cover_url) return null;
    return { poster_url: best.cover_url, source: "matched by game lookup" };
  } catch {
    return null;
  }
}

/** Try music lookup */
async function fetchMusicCover(title: string, barcode?: string): Promise<ArtworkResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("music-lookup", {
      body: { query: title, barcode },
    });
    if (error) return null;
    const coverUrl = data?.poster_url || data?.results?.[0]?.cover_url;
    if (coverUrl) return { poster_url: coverUrl, source: barcode ? "matched by music barcode" : "matched by music title" };
    return null;
  } catch {
    return null;
  }
}

/** Extract metadata helpers */
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

function getSeriesInfo(item: DbMediaItem): { seriesTitle?: string; seasonNumber?: number } | null {
  const meta = item.metadata as Record<string, any> | null;
  if (!meta) return null;
  const seriesTitle = meta.series_title;
  const seasonNumber = meta.season_number;
  if (seriesTitle || seasonNumber) return { seriesTitle, seasonNumber };
  return null;
}

/**
 * Resolve artwork for a single item using saved metadata in priority order:
 * A. barcode/UPC
 * B. edition/package title
 * C. box set package title + included_titles
 * D. canonical title + year + media_type
 * E. fallback text search
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

  // --- Movies / Music Films / TV ---

  // A. Barcode lookup (highest priority)
  const barcode = getBarcode(item);
  if (barcode) {
    const result = await lookupByBarcode(barcode);
    if (result) return result;
  }

  // B. Edition/package title lookup
  const editionTitle = getEditionTitle(item);
  if (editionTitle && editionTitle !== item.title) {
    const result = await lookupByTitle(editionTitle, undefined, isTvSeason);
    if (result) return { ...result, source: "matched by package title" };
  }

  // C. Box set: try package title, then included titles as context
  if (isBoxSet) {
    // Already tried edition title above; try canonical title as box set
    const result = await lookupByTitle(item.title, item.year ?? undefined, false);
    if (result) return { ...result, source: "matched by box set package title" };

    // Try first included title as fallback for set cover
    const included = getIncludedTitles(item);
    if (included.length > 0) {
      const firstResult = await lookupByTitle(included[0], undefined, false);
      if (firstResult) return { ...firstResult, source: "matched by box set included title" };
    }
    return null;
  }

  // C2. TV season: use series info
  if (isTvSeason) {
    const seriesInfo = getSeriesInfo(item);
    if (seriesInfo?.seriesTitle) {
      // Search for series + season
      const seasonQuery = seriesInfo.seasonNumber
        ? `${seriesInfo.seriesTitle} Season ${seriesInfo.seasonNumber}`
        : seriesInfo.seriesTitle;
      const result = await lookupByTitle(seasonQuery, undefined, true);
      if (result) return { ...result, source: "matched by TV season series info" };
    }
  }

  // D. Canonical title + year + media_type
  const preferTv = isTvSeason || item.title.toLowerCase().includes("season");
  const result = await lookupByTitle(item.title, item.year ?? undefined, preferTv);
  if (result) return { ...result, source: "matched by canonical TMDB title" };

  // E. Fallback: title without year
  if (item.year) {
    const fallback = await lookupByTitle(item.title, undefined, preferTv);
    if (fallback) return { ...fallback, source: "fallback text search" };
  }

  return null;
}

export function useFetchArtwork() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, found: 0 });
  const queryClient = useQueryClient();

  const fetchArtwork = useCallback(async (items: DbMediaItem[]) => {
    const missing = items.filter((i) => !i.poster_url);
    if (missing.length === 0) return { found: 0, total: 0 };

    setIsRunning(true);
    setProgress({ done: 0, total: missing.length, found: 0 });
    let found = 0;

    for (let i = 0; i < missing.length; i++) {
      const item = missing[i];
      try {
        const artworkResult = await resolveArtwork(item);

        if (artworkResult?.poster_url) {
          // Only update poster_url and artwork_source — do NOT overwrite genre/rating/title/etc.
          const currentMeta = (item.metadata as Record<string, any>) || {};
          const { error } = await supabase
            .from("media_items")
            .update({
              poster_url: artworkResult.poster_url,
              metadata: {
                ...currentMeta,
                artwork_source: artworkResult.source,
              },
            })
            .eq("id", item.id);
          if (!error) found++;
        }
      } catch {
        // Skip failed lookups silently
      }

      setProgress({ done: i + 1, total: missing.length, found });

      if (i < missing.length - 1) {
        await new Promise((r) => setTimeout(r, 250));
      }
    }

    setIsRunning(false);
    queryClient.invalidateQueries({ queryKey: ["media_items"] });
    return { found, total: missing.length };
  }, [queryClient]);

  return { fetchArtwork, isRunning, progress };
}
