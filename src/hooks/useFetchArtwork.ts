import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { searchTmdb } from "@/lib/tmdb";
import { useQueryClient } from "@tanstack/react-query";
import type { DbMediaItem } from "@/hooks/useMediaItems";

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
        const results = await searchTmdb(item.title, item.year ?? undefined);
        if (results.length > 0 && results[0].poster_url) {
          const { error } = await supabase
            .from("media_items")
            .update({
              poster_url: results[0].poster_url,
              genre: results[0].genre || item.genre,
              rating: results[0].rating || item.rating,
            })
            .eq("id", item.id);

          if (!error) found++;
        }
      } catch {
        // Skip failed lookups silently
      }

      setProgress({ done: i + 1, total: missing.length, found });

      // Rate limit: small delay between requests
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
