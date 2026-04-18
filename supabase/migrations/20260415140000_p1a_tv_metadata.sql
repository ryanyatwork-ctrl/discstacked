-- P1-A: TV metadata pipeline
--
-- Adds first-class columns for TV series metadata that today are either lost
-- entirely (BulkScanDialog) or stuffed into the metadata jsonb blob
-- (AddMovieDialog). Also introduces a content_type discriminator that is
-- distinct from media_type (which doubles as the tab bucket).
--
-- Backfill: existing data is preserved.
--   - content_type defaults to 'movie' for movies/music-films, mapped from
--     media_type for cds/games/books, or extracted from metadata->>content_type
--     when AddMovieDialog half-saved it.
--   - tmdb_series_id, season_number, episode_count are pulled out of the
--     metadata jsonb where AddMovieDialog had stuffed them.
--   - physical_products.content_type = 'box_set' when is_multi_title=true,
--     otherwise mapped from media_type.

-- ---------------------------------------------------------------------------
-- media_items
-- ---------------------------------------------------------------------------

ALTER TABLE public.media_items
  ADD COLUMN IF NOT EXISTS content_type   text NOT NULL DEFAULT 'movie',
  ADD COLUMN IF NOT EXISTS tmdb_series_id integer,
  ADD COLUMN IF NOT EXISTS season_number  integer,
  ADD COLUMN IF NOT EXISTS episode_count  integer;

-- Backfill content_type from media_type for non-movie tabs, then from
-- AddMovieDialog's metadata->>content_type stuffing where present.
UPDATE public.media_items
SET content_type = CASE
  WHEN media_type = 'cds'         THEN 'album'
  WHEN media_type = 'games'       THEN 'game'
  WHEN media_type = 'music-films' THEN 'music_film'
  ELSE 'movie'
END
WHERE content_type = 'movie';  -- only touches rows still on the default

-- Promote AddMovieDialog's metadata stuffing into real columns.
UPDATE public.media_items
SET content_type = metadata->>'content_type'
WHERE metadata ? 'content_type'
  AND metadata->>'content_type' IN ('movie','tv','tv_season','album','game','book','music_film');

UPDATE public.media_items
SET tmdb_series_id = (metadata->>'tmdb_series_id')::integer
WHERE tmdb_series_id IS NULL
  AND metadata ? 'tmdb_series_id'
  AND metadata->>'tmdb_series_id' ~ '^\d+$';

UPDATE public.media_items
SET season_number = (metadata->>'season_number')::integer
WHERE season_number IS NULL
  AND metadata ? 'season_number'
  AND metadata->>'season_number' ~ '^\d+$';

UPDATE public.media_items
SET episode_count = (metadata->>'episode_count')::integer
WHERE episode_count IS NULL
  AND metadata ? 'episode_count'
  AND metadata->>'episode_count' ~ '^\d+$';

-- Now lock the discriminator down.
ALTER TABLE public.media_items
  DROP CONSTRAINT IF EXISTS media_items_content_type_check;
ALTER TABLE public.media_items
  ADD CONSTRAINT media_items_content_type_check
  CHECK (content_type IN ('movie','tv','tv_season','album','game','book','music_film'));

-- Indexes for TV queries (frequent: "all my Game of Thrones seasons").
CREATE INDEX IF NOT EXISTS idx_media_items_tmdb_series
  ON public.media_items(user_id, tmdb_series_id)
  WHERE tmdb_series_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_items_content_type
  ON public.media_items(user_id, content_type);

-- ---------------------------------------------------------------------------
-- physical_products
-- ---------------------------------------------------------------------------

ALTER TABLE public.physical_products
  ADD COLUMN IF NOT EXISTS content_type text;

-- Backfill: multi-title products are 'box_set'; single-title mapped from
-- their media_type.
UPDATE public.physical_products
SET content_type = CASE
  WHEN is_multi_title = true       THEN 'box_set'
  WHEN media_type = 'cds'          THEN 'album'
  WHEN media_type = 'games'        THEN 'game'
  WHEN media_type = 'music-films'  THEN 'music_film'
  ELSE 'movie'
END
WHERE content_type IS NULL;

ALTER TABLE public.physical_products
  DROP CONSTRAINT IF EXISTS physical_products_content_type_check;
ALTER TABLE public.physical_products
  ADD CONSTRAINT physical_products_content_type_check
  CHECK (content_type IS NULL OR content_type IN ('movie','tv','tv_season','box_set','album','game','book','music_film'));

CREATE INDEX IF NOT EXISTS idx_physical_products_content_type
  ON public.physical_products(user_id, content_type);
