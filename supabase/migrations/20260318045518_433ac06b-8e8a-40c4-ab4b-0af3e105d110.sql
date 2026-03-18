-- Merge duplicates: for each (title, user_id, media_type) group with >1 rows,
-- keep the row that has the best data (poster_url, etc.) and merge formats

-- Step 1: Update the "keeper" row's formats array with all distinct formats from duplicates
WITH dupes AS (
  SELECT 
    title, user_id, media_type,
    array_agg(DISTINCT format) FILTER (WHERE format IS NOT NULL) as all_formats,
    (array_agg(id ORDER BY 
      CASE WHEN poster_url IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN in_plex THEN 0 ELSE 1 END,
      created_at
    ))[1] as keeper_id
  FROM media_items
  GROUP BY title, user_id, media_type
  HAVING COUNT(*) > 1
)
UPDATE media_items m
SET formats = d.all_formats
FROM dupes d
WHERE m.id = d.keeper_id;

-- Step 2: Also merge boolean flags (keep true if any copy had true)
WITH dupes AS (
  SELECT 
    title, user_id, media_type,
    bool_or(in_plex) as any_plex,
    bool_or(digital_copy) as any_digital,
    bool_or(wishlist) as any_wishlist,
    bool_or(want_to_watch) as any_want,
    (array_agg(id ORDER BY 
      CASE WHEN poster_url IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN in_plex THEN 0 ELSE 1 END,
      created_at
    ))[1] as keeper_id
  FROM media_items
  GROUP BY title, user_id, media_type
  HAVING COUNT(*) > 1
)
UPDATE media_items m
SET 
  in_plex = d.any_plex,
  digital_copy = d.any_digital,
  wishlist = d.any_wishlist,
  want_to_watch = d.any_want
FROM dupes d
WHERE m.id = d.keeper_id;

-- Step 3: Delete the non-keeper duplicates
WITH dupes AS (
  SELECT 
    title, user_id, media_type,
    (array_agg(id ORDER BY 
      CASE WHEN poster_url IS NOT NULL THEN 0 ELSE 1 END,
      CASE WHEN in_plex THEN 0 ELSE 1 END,
      created_at
    ))[1] as keeper_id
  FROM media_items
  GROUP BY title, user_id, media_type
  HAVING COUNT(*) > 1
)
DELETE FROM media_items m
USING dupes d
WHERE m.title = d.title 
  AND m.user_id = d.user_id 
  AND m.media_type = d.media_type
  AND m.id != d.keeper_id;