export type MediaTab = "movies" | "music-films" | "cds" | "books" | "games";

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
}

export const TABS: { id: MediaTab; label: string; icon: string }[] = [
  { id: "movies", label: "Movies", icon: "🎬" },
  { id: "music-films", label: "Music Media", icon: "🎵" },
  { id: "cds", label: "CDs", icon: "💿" },
  { id: "books", label: "Books", icon: "📚" },
  { id: "games", label: "Games", icon: "🎮" },
];

export const FORMATS: Record<MediaTab, string[]> = {
  movies: ["4K", "Blu-ray", "3D", "DVD", "Digital", "VHS"],
  "music-films": ["4K", "Blu-ray", "DVD", "Digital", "VHS"],
  cds: ["CD", "Vinyl", "Cassette", "Digital"],
  books: ["Hardcover", "Paperback", "eBook"],
  games: ["PS5", "Xbox", "Switch", "PC", "Digital"],
};

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ#".split("");
