import { MediaItem, MediaTab } from "./types";

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

export function generateMockData(tab: MediaTab): MediaItem[] {
  if (tab === "movies" || tab === "music-films") {
    return movieTitles.map((title, i) => ({
      id: `${tab}-${i}`,
      title,
      year: 1990 + Math.floor(Math.random() * 34),
      format: formats[Math.floor(Math.random() * 3)],
      inPlex: Math.random() > 0.3,
      digitalCopy: Math.random() > 0.5,
      wishlist: Math.random() > 0.85,
      wantToWatch: Math.random() > 0.7,
      lastWatched: Math.random() > 0.5 ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] : undefined,
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
      year: 1970 + Math.floor(Math.random() * 54),
      format: ["CD", "Vinyl", "Cassette"][Math.floor(Math.random() * 3)],
      posterUrl: `https://picsum.photos/seed/cd${i}/300/300`,
    }));
  }
  if (tab === "books") {
    const books = [
      "Atomic Habits", "Brave New World", "Catch-22", "Dune", "Ender's Game",
      "Fahrenheit 451", "Gone Girl", "Hitchhiker's Guide", "It", "Jurassic Park",
    ];
    return books.map((title, i) => ({
      id: `book-${i}`,
      title,
      author: "Author Name",
      year: 1950 + Math.floor(Math.random() * 74),
      format: ["Hardcover", "Paperback"][Math.floor(Math.random() * 2)],
      posterUrl: `https://picsum.photos/seed/book${i}/300/450`,
    }));
  }
  const games = [
    "Astro Bot", "Baldur's Gate 3", "Cyberpunk 2077", "Death Stranding", "Elden Ring",
    "Final Fantasy XVI", "God of War Ragnarök", "Hades", "It Takes Two", "Jedi Survivor",
  ];
  return games.map((title, i) => ({
    id: `game-${i}`,
    title,
    year: 2018 + Math.floor(Math.random() * 7),
    format: ["PS5", "Xbox", "Switch", "PC"][Math.floor(Math.random() * 4)],
    platform: "PS5",
    posterUrl: `https://picsum.photos/seed/game${i}/300/450`,
  }));
}
