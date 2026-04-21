import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MediaItem, MediaTab, TABS } from "@/lib/types";
import { PosterCard } from "@/components/PosterCard";
import { SharedDetailDrawer } from "@/components/SharedDetailDrawer";
import { searchMedia } from "@/lib/media-lookup";
import { MobileMenu } from "@/components/MobileMenu";
import heroLogo from "@/assets/DiscStacked_16x9.png";

type LandingSeed = Pick<MediaItem, "title" | "year" | "format" | "genre" | "mediaType" | "artist" | "platform">;

const LANDING_EXAMPLES: Record<MediaTab, LandingSeed[]> = {
  movies: [
    { title: "Interstellar", year: 2014, format: "Blu-ray", genre: "Science Fiction", mediaType: "movies" },
    { title: "Mad Max: Fury Road", year: 2015, format: "4K", genre: "Action", mediaType: "movies" },
    { title: "Arrival", year: 2016, format: "4K", genre: "Science Fiction", mediaType: "movies" },
    { title: "No Country for Old Men", year: 2007, format: "Blu-ray", genre: "Thriller", mediaType: "movies" },
    { title: "Oppenheimer", year: 2023, format: "Blu-ray", genre: "Drama", mediaType: "movies" },
    { title: "Blade Runner 2049", year: 2017, format: "4K", genre: "Science Fiction", mediaType: "movies" },
  ],
  "music-films": [
    { title: "Taylor Swift: The Eras Tour", artist: "Taylor Swift", year: 2023, format: "Blu-ray", genre: "Music", mediaType: "music-films" },
    { title: "Stop Making Sense", artist: "Talking Heads", year: 1984, format: "Blu-ray", genre: "Music", mediaType: "music-films" },
    { title: "Woodstock", artist: "Various Artists", year: 1970, format: "DVD", genre: "Music", mediaType: "music-films" },
    { title: "Metallica: Some Kind of Monster", artist: "Metallica", year: 2004, format: "Blu-ray", genre: "Documentary", mediaType: "music-films" },
  ],
  cds: [
    { title: "Abbey Road", artist: "The Beatles", year: 1969, format: "CD", genre: "Rock", mediaType: "cds" },
    { title: "Rumours", artist: "Fleetwood Mac", year: 1977, format: "Vinyl", genre: "Rock", mediaType: "cds" },
    { title: "Thriller", artist: "Michael Jackson", year: 1982, format: "CD", genre: "Pop", mediaType: "cds" },
    { title: "Nevermind", artist: "Nirvana", year: 1991, format: "CD", genre: "Rock", mediaType: "cds" },
  ],
  games: [
    { title: "The Legend of Zelda: Breath of the Wild", platform: "Nintendo Switch", year: 2017, format: "Switch", genre: "Adventure", mediaType: "games" },
    { title: "God of War Ragnarök", platform: "PlayStation 5", year: 2022, format: "PS5", genre: "Action", mediaType: "games" },
    { title: "Halo Infinite", platform: "Xbox Series X", year: 2021, format: "Xbox Series X", genre: "Shooter", mediaType: "games" },
    { title: "Marvel's Spider-Man 2", platform: "PlayStation 5", year: 2023, format: "PS5", genre: "Action", mediaType: "games" },
  ],
};

function seedToItem(seed: LandingSeed, index: number): MediaItem {
  return {
    id: `landing-${seed.mediaType}-${index}`,
    title: seed.title,
    year: seed.year,
    format: seed.format,
    formats: seed.format ? [seed.format] : undefined,
    genre: seed.genre,
    mediaType: seed.mediaType,
    artist: seed.artist,
    platform: seed.platform,
  };
}

export function LandingPreview({ onSignIn }: { onSignIn: () => void }) {
  const [activeTab, setActiveTab] = useState<MediaTab>("movies");
  const [items, setItems] = useState<MediaItem[]>(() => LANDING_EXAMPLES.movies.map(seedToItem));
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const baseItems = useMemo(
    () => LANDING_EXAMPLES[activeTab].map((seed, index) => seedToItem(seed, index)),
    [activeTab],
  );

  useEffect(() => {
    setItems(baseItems);

    let cancelled = false;
    Promise.all(
      baseItems.map(async (item) => {
        try {
          const mediaType = item.mediaType || activeTab;
          const isMusicRelease = mediaType === "cds";
          const primaryQuery = item.title;
          let results = await searchMedia(mediaType, primaryQuery, {
            year: isMusicRelease ? undefined : item.year,
            artist: item.artist,
            platform: mediaType === "games" ? item.platform : undefined,
          });
          if ((!results || results.length === 0) && isMusicRelease && item.artist) {
            results = await searchMedia(mediaType, item.title);
          }
          const best = results.find((result) => !!result.cover_url) || results[0];
          if (!best) return item;
          return {
            ...item,
            posterUrl: best.cover_url || item.posterUrl,
            genre: best.genre || item.genre,
            year: best.year || item.year,
            metadata: {
              ...(item.metadata || {}),
              overview: best.overview || null,
              runtime: best.runtime || null,
              tagline: best.tagline || null,
              cast: best.cast || null,
              crew: best.crew || null,
            },
          } as MediaItem;
        } catch {
          return item;
        }
      }),
    ).then((nextItems) => {
      if (!cancelled) setItems(nextItems);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, baseItems]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <MobileMenu isLoggedIn={false} showLabel />
            <img src={heroLogo} alt="DiscStacked" className="h-10 w-auto rounded object-contain" />
          </div>
          <Button variant="ghost" className="text-primary hover:text-primary" onClick={onSignIn}>
            Sign In
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10">
        <section className="mx-auto max-w-3xl text-center space-y-5">
          <img src={heroLogo} alt="DiscStacked" className="mx-auto h-auto w-[360px] max-w-full rounded-xl" />
          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Welcome to <span className="text-primary">DiscStacked</span>
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              Catalog movies, music media, CDs, and games with collector-grade details like exact editions,
              formats, disc counts, package notes, and cover art.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
              Try It Out
            </Button>
            <Button size="lg" variant="outline" onClick={onSignIn}>
              Sign In
            </Button>
          </div>
        </section>

        <section ref={previewRef} className="mt-16 space-y-6">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold">Interactive Preview</h2>
            <p className="text-sm text-muted-foreground">
              Tap a sample item to see how titles, details, and collector metadata look in DiscStacked.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {TABS.map((tab) => {
              return (
                <Button
                  key={tab.id}
                  variant={activeTab === tab.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className="gap-2"
                >
                  <span className="text-sm leading-none" aria-hidden="true">{tab.icon}</span>
                  <span>{tab.label}</span>
                </Button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <PosterCard
                key={item.id}
                item={item}
                onClick={setSelectedItem}
                variant="horizontal"
              />
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card/40 p-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Exact package details</Badge>
              <Badge variant="outline">Custom series sorting</Badge>
              <Badge variant="outline">Per-format tracking</Badge>
              <Badge variant="outline">Collector notes</Badge>
            </div>
          </div>
        </section>
      </main>

      <SharedDetailDrawer
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        itemList={items}
        onNavigate={setSelectedItem}
      />
    </div>
  );
}
