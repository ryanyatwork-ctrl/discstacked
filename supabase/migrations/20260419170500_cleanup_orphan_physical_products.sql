-- Remove any physical products that are no longer linked to a media item.
DELETE FROM public.physical_products pp
WHERE NOT EXISTS (
  SELECT 1
  FROM public.media_copies mc
  WHERE mc.physical_product_id = pp.id
);

-- Keep physical_products and media_copies in sync when a media item is deleted,
-- replaced during import, or otherwise unlinked from its package.
CREATE OR REPLACE FUNCTION public.cleanup_orphan_physical_products()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.physical_products pp
  WHERE pp.id = OLD.physical_product_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.media_copies mc
      WHERE mc.physical_product_id = OLD.physical_product_id
    );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS cleanup_orphan_physical_products_on_copy_delete ON public.media_copies;

CREATE TRIGGER cleanup_orphan_physical_products_on_copy_delete
AFTER DELETE ON public.media_copies
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_orphan_physical_products();
