INSERT INTO storage.buckets (id, name, public) VALUES ('cover-art', 'cover-art', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload cover art" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'cover-art');
CREATE POLICY "Anyone can view cover art" ON storage.objects FOR SELECT USING (bucket_id = 'cover-art');
CREATE POLICY "Users can update their uploads" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'cover-art');
CREATE POLICY "Users can delete their uploads" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'cover-art');