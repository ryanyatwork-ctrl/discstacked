import type { MediaItem } from "@/lib/types";

const RELIABLE_ARTWORK_HOSTS = new Set([
  "image.tmdb.org",
  "i.discogs.com",
  "img.discogs.com",
  "coverartarchive.org",
  "images.igdb.com",
  "media.rawg.io",
  "uehokbnqudoabjfzcfaj.supabase.co",
]);

function getEditionObject(item: MediaItem) {
  const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const edition = metadata.edition && typeof metadata.edition === "object" ? metadata.edition : {};
  return edition as Record<string, any>;
}

function getArtworkHost(url?: string | null) {
  if (!url) return null;

  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isReliablePosterUrl(url?: string | null) {
  const host = getArtworkHost(url);
  if (!host) return false;

  return RELIABLE_ARTWORK_HOSTS.has(host) || host.endsWith(".supabase.co");
}

export function preferPosterUrl(primary?: string | null, fallback?: string | null) {
  if (!primary) return fallback || null;
  if (!fallback || primary === fallback) return primary;

  if (!isReliablePosterUrl(primary) && isReliablePosterUrl(fallback)) {
    return fallback;
  }

  return primary;
}

export function getDisplayPosterUrl(item: MediaItem) {
  const edition = getEditionObject(item);
  const tmdbPosterUrl = typeof edition.tmdb_poster_url === "string" ? edition.tmdb_poster_url : null;
  const coverArtUrl = typeof edition.cover_art_url === "string" ? edition.cover_art_url : null;

  return preferPosterUrl(item.posterUrl || null, tmdbPosterUrl) || coverArtUrl || null;
}

export function getFallbackPosterUrl(item: MediaItem) {
  const edition = getEditionObject(item);
  return edition.tmdb_poster_url || edition.cover_art_url || null;
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
