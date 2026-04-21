import type { TablesInsert } from "@/integrations/supabase/types";

const VIDEO_FORMATS = ["DVD", "Blu-ray", "4K", "3D", "UMD", "VHS"] as const;

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(
    values
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )];
}

export function hasMusicVideoComponent(formats: string[] | null | undefined) {
  const normalized = uniqueStrings(formats || []);
  return normalized.some((format) => VIDEO_FORMATS.includes(format as typeof VIDEO_FORMATS[number])) || normalized.includes("DualDisc");
}

export function deriveMusicMediaFormats(formats: string[] | null | undefined) {
  const normalized = uniqueStrings(formats || []);
  const mirrorFormats = normalized.filter((format) => VIDEO_FORMATS.includes(format as typeof VIDEO_FORMATS[number]));

  if (normalized.includes("DualDisc")) {
    mirrorFormats.push("DVD", "DualDisc");
  }

  return uniqueStrings(mirrorFormats);
}

export function buildMusicMediaMirrorSignature(input: {
  barcode?: string | null;
  title?: string | null;
  year?: number | null;
  metadata?: Record<string, any> | null;
}) {
  const metadata = input.metadata || {};
  const clzDiscId = String(metadata.clz_disc_id || "").trim();
  const clzAlbumId = String(metadata.clz_album_id || "").trim();
  const barcode = String(input.barcode || metadata.barcode || "").trim();
  const catalogNumber = String(metadata.catalog_number || "").trim();
  const artist = String(metadata.artist || "").trim();
  const year = input.year != null ? String(input.year) : "";
  const title = String(input.title || "").trim();

  if (clzDiscId) return `clz-disc:${clzDiscId}`;
  if (clzAlbumId) return `clz-album:${clzAlbumId}`;
  if (barcode) return `barcode:${barcode}`;
  if (catalogNumber) return `catno:${artist.toLowerCase()}::${title.toLowerCase()}::${catalogNumber.toLowerCase()}::${year}`;
  return `title:${artist.toLowerCase()}::${title.toLowerCase()}::${year}`;
}

export function buildMusicMediaMirrorRow(
  userId: string,
  item: Pick<TablesInsert<"media_items">, "title" | "year" | "genre" | "notes" | "poster_url" | "barcode" | "metadata" | "formats"> & {
    sourceItemId?: string | null;
  },
): TablesInsert<"media_items"> | null {
  const metadata = (item.metadata as Record<string, any> | null) || {};
  const mirrorFormats = deriveMusicMediaFormats(item.formats || []);

  if (mirrorFormats.length === 0) {
    return null;
  }

  const mirrorSignature = buildMusicMediaMirrorSignature({
    barcode: item.barcode,
    title: item.title,
    year: item.year,
    metadata,
  });

  return {
    user_id: userId,
    media_type: "music-films",
    title: item.title,
    year: item.year,
    genre: item.genre,
    notes: item.notes,
    barcode: item.barcode,
    poster_url: item.poster_url,
    format: mirrorFormats[0] || null,
    formats: mirrorFormats,
    metadata: {
      ...metadata,
      artist: metadata.artist || null,
      label: metadata.label || null,
      catalog_number: metadata.catalog_number || null,
      country: metadata.country || null,
      mirror_source_type: "cds",
      mirror_signature: mirrorSignature,
      mirror_source_item_id: item.sourceItemId || null,
    },
  };
}
