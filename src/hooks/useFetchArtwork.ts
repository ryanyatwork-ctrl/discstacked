import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { searchTmdb } from "@/lib/tmdb";
import { useQueryClient } from "@tanstack/react-query";
import type { DbMediaItem } from "@/hooks/useMediaItems";

async function fetchGameCover(title: string): Promise<{ poster_url?: string; genre?: string; rating?: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke("game-lookup", {
      body: { query: title },
    });
    if (error || !data?.results?.length) return null;
    const best = data.results[0];
    if (!best.cover_url) return null;
    return {
      poster_url: best.cover_url,
      genre: best.genre || undefined,
      rating: best.rating || undefined,
    };
  } catch {
    return null;
  }
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
        let updateData: { poster_url?: string; genre?: string; rating?: number } | null = null;

        if (item.media_type === "games") {
          // Use IGDB/RAWG for game covers
          updateData = await fetchGameCover(item.title);
        } else {
          // Use TMDB for movies, music media, CDs
          let results = await searchTmdb(item.title, item.year ?? undefined, "movie");
          if (results.length === 0 || !results[0].poster_url) {
            results = await searchTmdb(item.title, item.year ?? undefined, "tv");
          }
          if (results.length > 0 && results[0].poster_url) {
            updateData = {
              poster_url: results[0].poster_url,
              genre: results[0].genre || undefined,
              rating: results[0].rating || undefined,
            };
          }
        }

        if (updateData?.poster_url) {
          const { error } = await supabase
            .from("media_items")
            .update({
              poster_url: updateData.poster_url,
              genre: updateData.genre || item.genre,
              rating: updateData.rating || item.rating,
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
