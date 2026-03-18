DELETE FROM public.media_items WHERE id IN ('5accfdb2-1a30-4464-943b-b5a3f5f4f44d', '71addd85-516c-4307-af7c-35cf5e05184d');

UPDATE public.media_items SET formats = ARRAY['DVD'] WHERE id = '3393d0b8-426a-421d-a8aa-939816a420a5';

UPDATE public.media_items SET formats = ARRAY['DVD', 'Blu-ray'],
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{box_sets}', '[{"title":"Alien Quadrilogy","format":"Blu-ray"}]'::jsonb)
WHERE id = 'cdf0ab5d-dee3-4075-ab5e-fce8f7148094';