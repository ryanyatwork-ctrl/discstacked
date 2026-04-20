import type { MediaItem } from "@/lib/types";

function getEditionObject(item: MediaItem) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const edition = metadata.edition && typeof metadata.edition === "object" ? metadata.edition : {};
  return edition as Record<string, any>;
}

export function getFallbackPosterUrl(item: MediaItem) {
  const edition = getEditionObject(item);
  return edition.tmdb_poster_url || null;
}

export function isPackageArtwork(item: MediaItem, src?: string | null) {
  if (!src) return false;
  const edition = getEditionObject(item);
  return src === edition.cover_art_url;
}

export function hasManualArtworkOverride(metadata: unknown) {
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, any>) : {};
  const source = typeof meta.artwork_source === "string" ? meta.artwork_source.toLowerCase() : "";

  return meta.artwork_locked === true
    || source.startsWith("manual")
    || source === "ai generated";
}
