import { MediaItem, MediaTab } from "./types";
import { searchTmdb } from "./tmdb";

const movieTitles = [
  "Alien", "Blade Runner 2049", "Casino Royale", "Dune", "Edge of Tomorrow",
  "Fight Club", "Gladiator", "Heat", "Inception", "John Wick",
  "Kill Bill", "Logan", "Mad Max: Fury Road", "No Country for Old Men", "Oppenheimer",
  "Pulp Fiction", "The Quick and the Dead", "Raiders of the Lost Ark", "Sicario", "The Thing",
  "Unforgiven", "Vertigo", "Whiplash", "X-Men: Days of Future Past", "Yesterday", "Zodiac",
  "Arrival", "Barbie", "Collateral", "Drive", "Ex Machina",
  "The French Dispatch", "Get Out", "Her", "Interstellar", "Joker",
  "Knives Out", "La La Land", "Memento", "Nightcrawler", "Once Upon a Time in Hollywood",
  "Parasite", "A Quiet Place", "The Revenant", "Skyfall", "Tenet",
  "Up", "Venom", "Wind River", "The X-Files: Fight the Future", "You Were Never Really Here", "Zero Dark Thirty",
];

const formats = ["4K", "Blu-ray", "DVD"];

const DEMO_POSTER_CACHE_KEY = "ds-demo-posters-v1";

let demoPosterCache: Record<string, string | null> | null = null;

function loadPosterCache() {
  if (demoPosterCache) return demoPosterCache;
  try {
    const raw = localStorage.getItem(DEMO_POSTER_CACHE_KEY);
    demoPosterCache = raw ? JSON.parse(raw) as Record<string, string | null> : {};
  } catch {
    demoPosterCache = {};
  }
  return demoPosterCache;
}

function savePosterCache() {
  if (!demoPosterCache) return;
  try {
    localStorage.setItem(DEMO_POSTER_CACHE_KEY, JSON.stringify(demoPosterCache));
  } catch {
    // Ignore storage failures in demo mode.
  }
}

export function generateMockData(tab: MediaTab): MediaItem[] {
  if (tab === "movies" || tab === "music-films") {
    return movieTitles.map((title, i) => ({
      id: `${tab}-${i}`,
      title,
      year: 1988 + ((i * 3) % 36),
      format: formats[i % formats.length],
      inPlex: i % 2 === 0,
      digitalCopy: i % 3 !== 0,
      wishlist: i % 7 === 0,
      wantToWatch: i % 5 === 0,
      lastWatched: i % 4 === 0 ? new Date(Date.now() - i * 11 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] : undefined,
    }));
  }
  if (tab === "cds") {
    const albums = [
      "Abbey Road", "Back in Black", "Chronic", "Dark Side of the Moon", "Electric Ladyland",
      "Future Nostalgia", "Grace", "Harvest", "In Rainbows", "Joshua Tree",
      "Kind of Blue", "Led Zeppelin IV", "Malibu", "Nevermind", "OK Computer",
      "Purple Rain", "Queens of the Stone Age", "Rumours", "Superunknown", "Thriller",
    ];
    return albums.map((title, i) => ({
      id: `cd-${i}`,
      title,
      artist: "Various Artists",
      year: 1970 + ((i * 4) % 50),
      format: ["CD", "Vinyl", "Cassette"][i % 3],
    }));
  }
  // Games (default fallthrough)
  const games = [
    "Astro Bot", "Baldur's Gate 3", "Cyberpunk 2077", "Death Stranding", "Elden Ring",
    "Final Fantasy XVI", "God of War Ragnarök", "Hades", "It Takes Two", "Jedi Survivor",
  ];
  return games.map((title, i) => ({
    id: `game-${i}`,
    title,
    year: 2018 + (i % 7),
    format: ["PS5", "Xbox", "Switch", "PC"][i % 4],
    platform: "PS5",
  }));
}

export async function hydrateMockDataPosters(items: MediaItem[], tab: MediaTab): Promise<MediaItem[]> {
  if (tab !== "movies" && tab !== "music-films") return items;

  const cache = loadPosterCache();
  const titlesToLookup = [...new Set(
    items
      .filter((item) => !item.posterUrl && cache[item.title] === undefined)
      .map((item) => item.title),
  )];

  if (titlesToLookup.length > 0) {
    await Promise.all(
      titlesToLookup.map(async (title) => {
        try {
          const results = await searchTmdb(title);
          const poster = results.find((result) => !!result.poster_url)?.poster_url || null;
          cache[title] = poster;
        } catch {
          cache[title] = null;
        }
      }),
    );
    savePosterCache();
  }

  return items.map((item) => ({
    ...item,
    posterUrl: item.posterUrl || cache[item.title] || undefined,
  }));
}
