
-- ============================================================
-- COMPREHENSIVE BOX SET CLEANUP
-- Delete box set records, link individual movies, fix formats
-- ============================================================

-- 1. DELETE BOX SET / COLLECTION ENTRIES
DELETE FROM public.media_items WHERE id IN (
  '92c31a54-2497-4981-bd24-745850db9517',  -- Harry Potter: The Complete 8-Film Collection
  '37a9e8ab-c4de-40d6-ab09-b57d39968417',  -- Star Wars Trilogy (Widescreen)
  '8cc41019-acb6-4ee3-99a4-60c917d073aa',  -- Star Wars: the Complete Saga
  '2c463ade-dbc4-4443-be24-018820f61d89',  -- Indiana Jones: The Adventure Collection
  '648c1677-cae3-4236-aa2c-c4c5a7cbb9d9',  -- Indiana Jones: the Complete Adventures
  '3d994901-eaca-4f50-8234-5ad3b00d4d74',  -- Riddick Trilogy
  '2f30bfa6-d344-4b0e-aa2f-a2d250c659dd',  -- Chronicles of Riddick / Pitch Black
  '60ed17c4-b40b-4cc3-9932-59dd0171fe9f',  -- National Lampoon's Ultimate Vacation Collection
  '63b174db-6dc0-481b-aaa6-7236076a7198',  -- Jurassic Park Ultimate Collection
  'cdf0ab5d-dee3-4075-ab5e-fce8f7148094'   -- Duplicate Alien: Resurrection
);

-- 2. HARRY POTTER: Link all 8 films to Complete Collection, add Blu-ray
UPDATE public.media_items SET
  formats = CASE
    WHEN 'Blu-ray' = ANY(formats) THEN formats
    ELSE array_append(COALESCE(formats, ARRAY[]::text[]), 'Blu-ray')
  END,
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{box_sets}',
    '[{"title":"Harry Potter: The Complete 8-Film Collection","format":"Blu-ray"}]'::jsonb
  )
WHERE id IN (
  '7302d440-a99e-4f88-ba4d-4ac70357dd36',  -- Sorcerer's Stone
  '341357e0-794c-4e56-895f-6f0527303cd2',  -- Chamber of Secrets
  'b04e0712-ddc8-4e73-9ced-ea0f4a0aa7e8',  -- Prisoner of Azkaban
  '92bc5493-3409-4f08-ba9c-89b05a01e7e3',  -- Goblet of Fire
  'e7686ae8-1291-42e5-9aca-ad367639143a',  -- Order of the Phoenix
  'e9b6359d-fc2c-4fd6-a1b9-4074605d2264',  -- Half-Blood Prince
  '41ddf1da-8dcf-4a5a-b3de-66451d24d82b',  -- Deathly Hallows Part I
  '4b387595-e8ae-478b-8be4-b4888501ff68'   -- Deathly Hallows Part 2
);

-- 3. STAR WARS Episodes I-III: Add Blu-ray from Complete Saga
UPDATE public.media_items SET
  formats = array_append(COALESCE(formats, ARRAY[]::text[]), 'Blu-ray'),
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{box_sets}',
    '[{"title":"Star Wars: The Complete Saga","format":"Blu-ray"}]'::jsonb
  )
WHERE id IN (
  'a8ffd214-1dfe-49b7-99ca-cc9f6952780d',  -- Episode I
  'ba9238f5-82ea-463e-a172-598c3598ed30',  -- Episode II
  '74ebd814-a7cd-448b-9b41-f15fa69afe7d'   -- Episode III
);

-- 4. STAR WARS Episodes IV-VI: Link to both Trilogy AND Complete Saga
UPDATE public.media_items SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{box_sets}',
    '[{"title":"Star Wars Trilogy (Widescreen)","format":"DVD"},{"title":"Star Wars: The Complete Saga","format":"Blu-ray"}]'::jsonb
  )
WHERE id IN (
  'a9e1e212-63a0-4f21-9344-dc620ade87ba',  -- Episode IV
  'efa5a4db-4404-4810-b5bf-8b3db2c390bf',  -- Episode V
  'adab1e50-d031-4c48-ad51-ac7297196c9d'   -- Episode VI
);

-- 5. INDIANA JONES: Link Raiders to both collections
UPDATE public.media_items SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{box_sets}',
    '[{"title":"Indiana Jones: The Adventure Collection","format":"DVD"},{"title":"Indiana Jones: The Complete Adventures","format":"DVD"}]'::jsonb
  )
WHERE id = 'd4cb7e0a-2d38-45a3-8614-a05363a9b5d2';

-- 6. INDIANA JONES: Create missing Temple of Doom and Last Crusade
INSERT INTO public.media_items (user_id, media_type, title, year, format, formats, metadata) VALUES
  ('7ef02ad9-3b7e-4bdf-9972-4a538f6f2078', 'movies', 'Indiana Jones and the Temple of Doom', 1984, 'DVD', ARRAY['DVD'], 
   '{"box_sets":"[{\"title\":\"Indiana Jones: The Adventure Collection\",\"format\":\"DVD\"},{\"title\":\"Indiana Jones: The Complete Adventures\",\"format\":\"DVD\"}]"}'::jsonb),
  ('7ef02ad9-3b7e-4bdf-9972-4a538f6f2078', 'movies', 'Indiana Jones and the Last Crusade', 1989, 'DVD', ARRAY['DVD'],
   '{"box_sets":"[{\"title\":\"Indiana Jones: The Adventure Collection\",\"format\":\"DVD\"},{\"title\":\"Indiana Jones: The Complete Adventures\",\"format\":\"DVD\"}]"}'::jsonb);

-- 7. INDIANA JONES: Link Crystal Skull to Complete Adventures only
UPDATE public.media_items SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{box_sets}',
    '[{"title":"Indiana Jones: The Complete Adventures","format":"DVD"}]'::jsonb
  )
WHERE id = '601db93a-7938-4daf-8974-31589e8110bb';

-- 8. RIDDICK: Link Pitch Black and Chronicles of Riddick to Trilogy
UPDATE public.media_items SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{box_sets}',
    '[{"title":"Riddick Trilogy","format":"DVD"}]'::jsonb
  )
WHERE id IN (
  'd58763d6-86fc-4232-b36d-82295741b55b',  -- Pitch Black
  '8a3bfb9e-024c-416b-ae91-945f0906212b'   -- Chronicles of Riddick
);

-- 9. NATIONAL LAMPOON'S: Link vacation movies to Ultimate Collection
UPDATE public.media_items SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{box_sets}',
    '[{"title":"National Lampoon''s Ultimate Vacation Collection","format":"DVD"}]'::jsonb
  )
WHERE id IN (
  '9ca68591-1ba9-43f0-b8cb-d89bcd738372',  -- NL Christmas Vacation
  '491d34dd-d344-41a0-9f6f-6402bcf74f6c',  -- NL European Vacation
  'ae49be87-78bd-445a-9c53-1ef7091ed2c3',  -- NL Vacation
  'f43022ef-c480-47fa-b95e-d5a8315eae72'   -- Vegas Vacation
);

-- 10. JURASSIC PARK: Link original trilogy to Ultimate Collection
UPDATE public.media_items SET
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{box_sets}',
    '[{"title":"Jurassic Park Ultimate Collection","format":"DVD"}]'::jsonb
  )
WHERE id IN (
  '22a44b82-d739-4a20-9178-8a6d2c273505',  -- Jurassic Park
  'e608ffbc-b6b5-4d3a-bce4-2026827d7eb9',  -- The Lost World
  '79bea9c9-ca9d-452c-9eaf-89cdfb74a962'   -- Jurassic Park III
);
