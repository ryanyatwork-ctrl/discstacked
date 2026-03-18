ALTER TABLE media_items ADD COLUMN IF NOT EXISTS formats text[] DEFAULT '{}';

UPDATE media_items SET formats = ARRAY[format] WHERE format IS NOT NULL AND (formats IS NULL OR formats = '{}');