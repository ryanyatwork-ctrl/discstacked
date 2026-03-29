CREATE POLICY "Authenticated can view shared media items"
ON public.media_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = media_items.user_id
    AND profiles.share_token IS NOT NULL
  )
);