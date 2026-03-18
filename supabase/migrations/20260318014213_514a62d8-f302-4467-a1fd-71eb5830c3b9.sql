
-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create media_items table
CREATE TABLE public.media_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('movies', 'music-films', 'cds', 'books', 'games')),
  title TEXT NOT NULL,
  year INTEGER,
  format TEXT,
  poster_url TEXT,
  genre TEXT,
  rating NUMERIC(3,1),
  notes TEXT,
  in_plex BOOLEAN NOT NULL DEFAULT false,
  digital_copy BOOLEAN NOT NULL DEFAULT false,
  wishlist BOOLEAN NOT NULL DEFAULT false,
  want_to_watch BOOLEAN NOT NULL DEFAULT false,
  last_watched DATE,
  watch_notes TEXT,
  amazon_tag TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.media_items ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own items"
  ON public.media_items FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own items"
  ON public.media_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own items"
  ON public.media_items FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own items"
  ON public.media_items FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_media_items_user_type ON public.media_items(user_id, media_type);
CREATE INDEX idx_media_items_title ON public.media_items(title);

-- Timestamp trigger
CREATE TRIGGER update_media_items_updated_at
  BEFORE UPDATE ON public.media_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
