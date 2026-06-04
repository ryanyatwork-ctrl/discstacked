
-- ============================================================
-- 1. Expand media_type CHECK constraint to include TV types
-- ============================================================

-- Drop the old restrictive constraint (auto-named from original CREATE TABLE)
ALTER TABLE public.media_items
  DROP CONSTRAINT IF EXISTS media_items_media_type_check;

-- Add updated constraint with TV types
ALTER TABLE public.media_items
  ADD CONSTRAINT media_items_media_type_check
  CHECK (media_type IN ('movies', 'tv', 'tv-season', 'music-films', 'cds', 'books', 'games'));

-- ============================================================
-- 2. Create upsert_physical_media RPC function
--    Called by BulkScanDialog via supabase.rpc("upsert_physical_media", ...)
--    Atomically finds-or-creates: media_item + physical_product + media_copy
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_physical_media(
  p_user_id        uuid,
  p_media_type     text,
  p_title          text,
  p_year           integer  DEFAULT NULL,
  p_external_id    text     DEFAULT NULL,
  p_format         text     DEFAULT NULL,
  p_formats        text[]   DEFAULT '{}',
  p_barcode        text     DEFAULT NULL,
  p_product_title  text     DEFAULT NULL,
  p_poster_url     text     DEFAULT NULL,
  p_genre          text     DEFAULT NULL,
  p_metadata       jsonb    DEFAULT '{}'::jsonb,
  p_is_multi_title boolean  DEFAULT false,
  p_edition        text     DEFAULT NULL,
  p_disc_label     text     DEFAULT 'Main Disc'
)
RETURNS TABLE (
  media_item_id       uuid,
  physical_product_id uuid,
  media_copy_id       uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_media_item_id       uuid;
  v_physical_product_id uuid;
  v_media_copy_id       uuid;
  v_product_title       text;
  v_want_to_watch       boolean;
BEGIN
  v_product_title   := COALESCE(NULLIF(trim(p_product_title), ''), p_title);
  v_want_to_watch   := (p_format IS NULL AND (p_formats IS NULL OR p_formats = '{}'));

  -- ── 1. Find or create media_item ────────────────────────────
  -- Priority: external_id match → title match → insert

  IF p_external_id IS NOT NULL AND p_external_id != '' THEN
    SELECT id INTO v_media_item_id
    FROM media_items
    WHERE user_id    = p_user_id
      AND external_id = p_external_id
      AND media_type  = p_media_type
    LIMIT 1;
  END IF;

  IF v_media_item_id IS NULL THEN
    SELECT id INTO v_media_item_id
    FROM media_items
    WHERE user_id   = p_user_id
      AND media_type = p_media_type
      AND lower(title) = lower(p_title)
    LIMIT 1;
  END IF;

  IF v_media_item_id IS NULL THEN
    INSERT INTO media_items (
      user_id, media_type, title, year, format, formats,
      barcode, poster_url, genre, external_id, metadata,
      in_plex, digital_copy, wishlist, want_to_watch
    ) VALUES (
      p_user_id, p_media_type, p_title, p_year,
      p_format, COALESCE(p_formats, '{}'),
      NULLIF(p_barcode, ''), p_poster_url, p_genre, NULLIF(p_external_id, ''),
      COALESCE(p_metadata, '{}'::jsonb),
      false, false, false, v_want_to_watch
    )
    RETURNING id INTO v_media_item_id;
  ELSE
    -- Backfill missing data on existing items (never overwrite with NULLs)
    UPDATE media_items SET
      poster_url  = COALESCE(poster_url,  p_poster_url),
      genre       = COALESCE(genre,       p_genre),
      external_id = COALESCE(external_id, NULLIF(p_external_id, '')),
      year        = COALESCE(year,        p_year),
      barcode     = COALESCE(barcode,     NULLIF(p_barcode, ''))
    WHERE id = v_media_item_id;
  END IF;

  -- ── 2. Find or create physical_product ──────────────────────
  -- Match on barcode when available; otherwise always create a new product

  IF p_barcode IS NOT NULL AND p_barcode != '' THEN
    SELECT id INTO v_physical_product_id
    FROM physical_products
    WHERE user_id = p_user_id
      AND barcode  = p_barcode
    LIMIT 1;
  END IF;

  IF v_physical_product_id IS NULL THEN
    INSERT INTO physical_products (
      user_id, barcode, product_title, formats, media_type,
      is_multi_title, disc_count, edition, metadata
    ) VALUES (
      p_user_id,
      NULLIF(p_barcode, ''),
      v_product_title,
      COALESCE(p_formats, '{}'),
      p_media_type,
      COALESCE(p_is_multi_title, false),
      GREATEST(COALESCE(array_length(p_formats, 1), 0), 1),
      p_edition,
      COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_physical_product_id;
  END IF;

  -- ── 3. Find or create media_copy ────────────────────────────

  SELECT id INTO v_media_copy_id
  FROM media_copies
  WHERE media_item_id       = v_media_item_id
    AND physical_product_id = v_physical_product_id
  LIMIT 1;

  IF v_media_copy_id IS NULL THEN
    INSERT INTO media_copies (
      media_item_id, physical_product_id, format, disc_label
    ) VALUES (
      v_media_item_id,
      v_physical_product_id,
      p_format,
      COALESCE(NULLIF(p_disc_label, ''), 'Main Disc')
    )
    RETURNING id INTO v_media_copy_id;
  END IF;

  RETURN QUERY SELECT v_media_item_id, v_physical_product_id, v_media_copy_id;
END;
$$;
