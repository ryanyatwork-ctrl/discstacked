import { useState, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MediaTab, MediaItem } from "@/lib/types";
import { generateMockData } from "@/lib/mock-data";
import { TabSwitcher } from "@/components/TabSwitcher";
import { FilterBar } from "@/components/FilterBar";
import { AlphabetRail } from "@/components/AlphabetRail";
import { PosterCard } from "@/components/PosterCard";
import { ListRow } from "@/components/ListRow";
import { DetailDrawer } from "@/components/DetailDrawer";
import { MobileMenu } from "@/components/MobileMenu";
import { MobileTabBar } from "@/components/MobileTabBar";
import { ImportDialog } from "@/components/ImportDialog";
import { WelcomeSection } from "@/components/WelcomeSection";
import { CollectionStats } from "@/components/CollectionStats";
import { RandomizerDialog } from "@/components/RandomizerDialog";
import { AddMovieDialog } from "@/components/AddMovieDialog";
import { Users, LogIn, LogOut, LayoutGrid, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useMediaItems, DbMediaItem } from "@/hooks/useMediaItems";
import logo from "@/assets/DiscStacked_16x9.png";

function dbToMediaItem(db: DbMediaItem): MediaItem {
  const formats = (db as any).formats as string[] | null;
  return {
    id: db.id,
    title: db.title,
    year: db.year ?? undefined,
    format: db.format ?? undefined,
    formats: formats && formats.length > 0 ? formats : db.format ? [db.format] : undefined,
    posterUrl: db.poster_url ?? undefined,
    genre: db.genre ?? undefined,
    rating: db.rating ?? undefined,
    notes: db.notes ?? undefined,
    inPlex: db.in_plex,
    digitalCopy: db.digital_copy,
    wishlist: db.wishlist,
    wantToWatch: db.want_to_watch,
    lastWatched: db.last_watched ?? undefined,
    watchNotes: db.watch_notes ?? undefined,
    mediaType: db.media_type as MediaTab,
  };
}

type ViewMode = "covers" | "list";

export default function Index() {
  const [activeTab, setActiveTab] = useState<MediaTab>("movies");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"plex" | "digital" | null>(null);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("covers");
  const gridRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { user, signOut } = useAuth();
  const { data: dbItems, isLoading } = useMediaItems(activeTab);

  const allItems = useMemo(() => {
    if (user && dbItems && dbItems.length > 0) {
      return dbItems.map(dbToMediaItem);
    }
    if (user && dbItems && dbItems.length === 0) {
      return [];
    }
    return generateMockData(activeTab);
  }, [activeTab, user, dbItems]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => i.title.toLowerCase().includes(q));
    }
    if (activeFormats.length > 0) {
      items = items.filter((i) => i.format && activeFormats.includes(i.format));
    }
    if (statusFilter === "plex") {
      items = items.filter((i) => i.inPlex);
    } else if (statusFilter === "digital") {
      items = items.filter((i) => i.digitalCopy);
    }
    return items.sort((a, b) => a.title.localeCompare(b.title));
  }, [allItems, searchQuery, activeFormats, statusFilter]);

  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    filteredItems.forEach((item) => {
      const first = item.title[0]?.toUpperCase();
      if (first && /[A-Z]/.test(first)) letters.add(first);
      else letters.add("#");
    });
    return letters;
  }, [filteredItems]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, MediaItem[]> = {};
    filteredItems.forEach((item) => {
      const first = item.title[0]?.toUpperCase();
      const key = first && /[A-Z]/.test(first) ? first : "#";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filteredItems]);

  const handleFormatToggle = useCallback((format: string) => {
    setActiveFormats((prev) =>
      prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]
    );
  }, []);

  const handleLetterClick = useCallback((letter: string) => {
    setActiveLetter(letter);
    const el = document.getElementById(`letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleTabChange = useCallback((tab: MediaTab) => {
    setActiveTab(tab);
    setSearchQuery("");
    setActiveFormats([]);
    setStatusFilter(null);
    setActiveLetter(null);
  }, []);

  const handleStatsClick = useCallback((type: "plex" | "digital") => {
    setStatusFilter((prev) => (prev === type ? null : type));
    setActiveFormats([]);
  }, []);

  const sortedLetters = Object.keys(groupedItems).sort();

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2 min-w-0">
            <MobileMenu
              isLoggedIn={!!user}
              onSignOut={signOut}
            />
            <img src={logo} alt="DiscStacked" className="h-8 sm:h-10 w-auto rounded object-contain" />
          </div>
          {/* Desktop tabs */}
          <div className="hidden md:flex items-center gap-2">
            <TabSwitcher activeTab={activeTab} onTabChange={handleTabChange} />
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            {user ? (
              <>
                <AddMovieDialog activeTab={activeTab} />
                <FetchArtworkButton items={dbItems ?? []} />
                <RandomizerDialog items={filteredItems} />
                <ImportDialog activeTab={activeTab} />
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex text-muted-foreground hover:text-foreground"
                  onClick={() => toast({ title: "Coming soon", description: "Friends features are not yet available." })}
                >
                  <Users className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden sm:inline-flex text-muted-foreground hover:text-foreground"
                  onClick={() => signOut()}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:text-primary/80 gap-1.5"
                onClick={() => navigate("/auth")}
              >
                <LogIn className="h-4 w-4" />
                <span className="hidden sm:inline">Sign In</span>
              </Button>
            )}
          </div>
        </div>
        <div className="px-3 pb-2 sm:px-4 sm:pb-3">
          <FilterBar
            activeTab={activeTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeFormats={activeFormats}
            onFormatToggle={handleFormatToggle}
          />
        </div>
      </header>

      {/* Welcome / Stats Section */}
      {!user ? (
        <WelcomeSection />
      ) : (
        <CollectionStats items={dbItems ?? []} isLoading={isLoading} onStatsClick={handleStatsClick} activeStatusFilter={statusFilter} />
      )}

      {/* Collection stats + view toggle */}
      <div className="px-4 py-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isLoading ? "Loading..." : `${filteredItems.length} items`}
          {activeFormats.length > 0 && ` · Filtered`}
          {!user && " · Demo mode"}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={viewMode === "covers" ? "text-primary" : "text-muted-foreground hover:text-foreground"}
            onClick={() => setViewMode("covers")}
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={viewMode === "list" ? "text-primary" : "text-muted-foreground hover:text-foreground"}
            onClick={() => setViewMode("list")}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Grid / List */}
      <main className="px-4 pb-8 pr-8" ref={gridRef}>
        {sortedLetters.map((letter) => (
          <div key={letter} id={`letter-${letter}`} className="mb-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 sticky top-[120px] bg-background/95 backdrop-blur-sm py-1 z-10">
              {letter}
            </h2>
            {viewMode === "covers" ? (
              <div className="poster-grid">
                {groupedItems[letter].map((item) => (
                  <PosterCard key={item.id} item={item} onClick={setSelectedItem} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col">
                {groupedItems[letter].map((item) => (
                  <ListRow key={item.id} item={item} onClick={setSelectedItem} />
                ))}
              </div>
            )}
          </div>
        ))}
        {!isLoading && filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            {user ? (
              <>
                <p className="text-sm">Your collection is empty</p>
                <p className="text-xs mt-1">Use the upload button to import your collection</p>
              </>
            ) : (
              <>
                <p className="text-sm">No items found</p>
                <p className="text-xs mt-1">Try adjusting your search or filters</p>
              </>
            )}
          </div>
        )}
      </main>

      {/* A-Z Rail */}
      <AlphabetRail
        activeLetter={activeLetter}
        onLetterClick={handleLetterClick}
        availableLetters={availableLetters}
      />

      {/* Mobile Bottom Tab Bar */}
      <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Detail Drawer */}
      <DetailDrawer
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
