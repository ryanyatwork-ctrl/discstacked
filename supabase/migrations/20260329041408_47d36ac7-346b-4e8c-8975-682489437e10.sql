
-- Add external_id column to media_items for deduplication (tmdb_id, discogs_id, etc.)
ALTER TABLE media_items ADD COLUMN IF NOT EXISTS external_id text;

-- Create physical_products table
CREATE TABLE physical_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  barcode text,
  product_title text NOT NULL,
  formats text[] DEFAULT '{}',
  edition text,
  media_type text NOT NULL,
  is_multi_title boolean DEFAULT false,
  disc_count integer DEFAULT 1,
  purchase_date date,
  purchase_price numeric(10,2),
  purchase_location text,
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE physical_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own products" ON physical_products FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own products" ON physical_products FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own products" ON physical_products FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own products" ON physical_products FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Anon can view shared products" ON physical_products FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = physical_products.user_id AND profiles.share_token IS NOT NULL));
CREATE POLICY "Auth can view shared products" ON physical_products FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.user_id = physical_products.user_id AND profiles.share_token IS NOT NULL));

-- Create media_copies join table
CREATE TABLE media_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_item_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  physical_product_id uuid NOT NULL REFERENCES physical_products(id) ON DELETE CASCADE,
  format text,
  disc_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(media_item_id, physical_product_id)
);

ALTER TABLE media_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own copies" ON media_copies FOR SELECT USING (EXISTS (SELECT 1 FROM media_items WHERE media_items.id = media_copies.media_item_id AND media_items.user_id = auth.uid()));
CREATE POLICY "Users can insert own copies" ON media_copies FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM media_items WHERE media_items.id = media_copies.media_item_id AND media_items.user_id = auth.uid()));
CREATE POLICY "Users can update own copies" ON media_copies FOR UPDATE USING (EXISTS (SELECT 1 FROM media_items WHERE media_items.id = media_copies.media_item_id AND media_items.user_id = auth.uid()));
CREATE POLICY "Users can delete own copies" ON media_copies FOR DELETE USING (EXISTS (SELECT 1 FROM media_items WHERE media_items.id = media_copies.media_item_id AND media_items.user_id = auth.uid()));
CREATE POLICY "Anon can view shared copies" ON media_copies FOR SELECT TO anon USING (EXISTS (SELECT 1 FROM media_items mi JOIN profiles p ON p.user_id = mi.user_id WHERE mi.id = media_copies.media_item_id AND p.share_token IS NOT NULL));
CREATE POLICY "Auth can view shared copies" ON media_copies FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM media_items mi JOIN profiles p ON p.user_id = mi.user_id WHERE mi.id = media_copies.media_item_id AND p.share_token IS NOT NULL));

-- Triggers
CREATE TRIGGER update_physical_products_updated_at BEFORE UPDATE ON physical_products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-migrate existing data: create a physical_product for each media_item, then link via media_copies
DO $$
DECLARE
  r RECORD;
  pp_id uuid;
BEGIN
  FOR r IN SELECT id, user_id, barcode, title, formats, format, media_type FROM media_items LOOP
    INSERT INTO physical_products (user_id, barcode, product_title, formats, media_type)
    VALUES (r.user_id, r.barcode, r.title, COALESCE(r.formats, '{}'), r.media_type)
    RETURNING id INTO pp_id;
    
    INSERT INTO media_copies (media_item_id, physical_product_id, format)
    VALUES (r.id, pp_id, r.format);
  END LOOP;
END $$;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE physical_products;
ALTER PUBLICATION supabase_realtime ADD TABLE media_copies;
