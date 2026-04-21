export type MediaTab = "movies" | "music-films" | "cds" | "games";

export const DEFAULT_MEDIA_TAB: MediaTab = "movies";

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

const LEGACY_MEDIA_TAB_MAP: Record<string, MediaTab> = {
  tv: "movies",
  music: "cds",
};

export function coerceMediaTab(value: string | null | undefined): MediaTab {
  if (!value) return DEFAULT_MEDIA_TAB;

  if (TABS.some((tab) => tab.id === value)) {
    return value as MediaTab;
  }

  return LEGACY_MEDIA_TAB_MAP[value] || DEFAULT_MEDIA_TAB;
}

export const FORMATS: Record<MediaTab, string[]> = {
  movies: ["4K", "Blu-ray", "3D", "DVD", "Digital", "UltraViolet", "UMD", "VHS"],
  "music-films": ["4K", "Blu-ray", "3D", "DVD", "Digital", "UltraViolet", "UMD", "VHS"],
  cds: ["CD", "Enhanced CD", "DualDisc", "Blu-ray", "4K", "3D", "DVD", "Vinyl", "Cassette", "Digital"],
  games: ["PS5", "PS4", "PS3", "PS2", "Xbox Series X", "Xbox One", "Xbox 360", "Switch", "Wii U", "Wii", "3DS", "DS", "GameCube", "N64", "SNES", "NES", "Game Boy", "Sega Genesis", "Dreamcast", "Atari", "PC", "Steam", "Digital"],
};

export const ALPHABET = ["#", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")];
