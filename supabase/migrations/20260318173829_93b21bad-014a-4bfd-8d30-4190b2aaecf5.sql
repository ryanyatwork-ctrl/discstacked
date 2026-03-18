UPDATE media_items
SET formats = array_append(formats, 'Blu-ray'),
    updated_at = now()
WHERE (
  metadata->>'audio_tracks' ILIKE '%dts-hd%'
  OR metadata->>'audio_tracks' ILIKE '%truehd%'
  OR metadata->>'audio_tracks' ILIKE '%true hd%'
  OR metadata->>'audio_tracks' ILIKE '%atmos%'
  OR metadata->>'edition' ILIKE '%blu-ray%'
  OR metadata->>'edition' ILIKE '%blu ray%'
)
AND NOT ('Blu-ray' = ANY(formats))
AND NOT ('4K' = ANY(formats));