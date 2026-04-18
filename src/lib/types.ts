export type MediaTab = "movies" | "music-films" | "cds" | "games";

/**
 * Discriminates the kind of work a MediaItem represents. Distinct from
 * MediaTab (which is the UI-level bucket). Most values map 1:1 to a tab,
 * except movies/music-films which split into movie/tv/tv_season/music_film.
 *
 * Constrained on the DB side by media_items.content_type_check.
 */
export type ContentType =
  | "movie"
  | "tv"
  | "tv_season"
  | "album"
  | "game"
  | "book"
  | "music_film";

/**
 * Discriminator for a physical_products row — mostly matches ContentType
 * but adds 'box_set' for multi-title containers.
 */
export type PhysicalContentType = ContentType | "box_set";

/**
 * Derive a reasonable ContentType from a lookup result's media_type field
 * (returned by TMDB/edge function) falling back to the UI tab. Used by
 * both BulkScanDialog and AddMovieDialog when persisting new items.
 */
export function deriveContentType(
  lookupMediaType: string | null | undefined,
  tab: MediaTab
): ContentType {
  // Lookup-driven: TMDB explicitly tagged this item.
  if (lookupMediaType === "tv") return "tv";
  if (lookupMediaType === "tv_season") return "tv_season";
  if (lookupMediaType === "movie") return "movie";
  // Tab-driven fallback for tabs that don't use the TMDB pipeline.
  if (tab === "cds") return "album";
  if (tab === "games") return "game";
  if (tab === "music-films") return "music_film";
  return "movie";
}

export interface MediaItem {
  id: string;
  title: string;
  sortTitle?: string;
  year?: number;
  format?: string;
  formats?: string[];
  posterUrl?: string;
  genre?: string;
  rating?: number;
  notes?: string;
  inPlex?: boolean;
  digitalCopy?: boolean;
  wishlist?: boolean;
  wantToWatch?: boolean;
  lastWatched?: string;
  watchNotes?: string;
  mediaType?: MediaTab;
  contentType?: ContentType;
  // TV-specific — populated only when contentType is "tv" or "tv_season"
  tmdbSeriesId?: number | null;
  seasonNumber?: number | null;
  episodeCount?: number | null;
  artist?: string;
  author?: string;
  platform?: string;
  barcode?: string;
  totalCopies?: number;
  metadata?: Record<string, any>;
}

export const TABS: { id: MediaTab; label: string; icon: string }[] = [
  { id: "movies", label: "Movies", icon: "🎬" },
  { id: "music-films", label: "Music Media", icon: "🎵" },
  { id: "cds", label: "CDs", icon: "💿" },
  { id: "games", label: "Games", icon: "🎮" },
];

export const FORMATS: Record<MediaTab, string[]> = {
  movies: ["4K", "Blu-ray", "3D", "DVD", "Digital", "UltraViolet", "UMD", "VHS"],
  "music-films": ["4K", "Blu-ray", "3D", "DVD", "Digital", "UltraViolet", "UMD", "VHS"],
  cds: ["CD", "Vinyl", "Cassette", "Digital"],
  games: ["PS5", "PS4", "PS3", "PS2", "Xbox Series X", "Xbox One", "Xbox 360", "Switch", "Wii U", "Wii", "3DS", "DS", "GameCube", "N64", "SNES", "NES", "Game Boy", "Sega Genesis", "Dreamcast", "Atari", "PC", "Steam", "Digital"],
};

export const ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
