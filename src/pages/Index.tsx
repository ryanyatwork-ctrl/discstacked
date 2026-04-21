import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MediaTab, MediaItem, coerceMediaTab, DEFAULT_MEDIA_TAB } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { generateMockData, hydrateMockDataPosters } from "@/lib/mock-data";
import { getCollectorGroupLetter, getCollectorSortKey } from "@/lib/utils";
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
import { BulkScanDialog } from "@/components/BulkScanDialog";
import { LogIn, LogOut, LayoutGrid, List, Pin, PinOff, Layers } from "lucide-react";
import { useAutoHideHeader } from "@/hooks/useAutoHideHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useMediaItems, DbMediaItem } from "@/hooks/useMediaItems";
import logo from "@/assets/DiscStacked_16x9.png";
import { buildCollectionSearchText } from "@/lib/media-item-utils";
import { CollectionViewMode, coerceCollectionViewMode, DEFAULT_COLLECTION_VIEW } from "@/lib/view-mode";

function dbToMediaItem(db: DbMediaItem): MediaItem {
  const formats = (db as any).formats as string[] | null;
  return {
    id: db.id,
    title: db.title,
    sortTitle: (db as any).sort_title ?? undefined,
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
    barcode: (db as any).barcode ?? undefined,
    totalCopies: (db as any).total_copies ?? 1,
    metadata: (db as any).metadata ?? undefined,
  };
}

type SortMode = "title" | "year" | "recent";

function getStored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch { return fallback; }
}

export default function Index() { // force rebuild
  const [activeTab, setActiveTab] = useState<MediaTab>(() => coerceMediaTab(getStored("ds-default-tab", DEFAULT_MEDIA_TAB)));
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<CollectionViewMode>(() => coerceCollectionViewMode(getStored("ds-default-view", DEFAULT_COLLECTION_VIEW)));
  const [sortMode, setSortMode] = useState<SortMode>(() => getStored("ds-default-sort", "title"));
  const [demoItems, setDemoItems] = useState<MediaItem[]>(() => generateMockData(DEFAULT_MEDIA_TAB));
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { user, signOut } = useAuth();
  const { data: dbItems, isLoading } = useMediaItems(activeTab);
  const { visible: headerVisible, pinned: headerPinned, togglePin: toggleHeaderPin } = useAutoHideHeader(scrollRef);

  useEffect(() => {
    if (user) return;

    const baseItems = generateMockData(activeTab);
    setDemoItems(baseItems);

    let cancelled = false;
    hydrateMockDataPosters(baseItems, activeTab).then((hydratedItems) => {
      if (!cancelled) setDemoItems(hydratedItems);
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab, user]);

  const allItems = useMemo(() => {
    if (user && dbItems && dbItems.length > 0) {
      return dbItems.map(dbToMediaItem);
    }
    if (user && dbItems && dbItems.length === 0) {
      return [];
    }
    return demoItems;
  }, [user, dbItems, demoItems]);

  // Derive live selectedItem from latest data so edits are reflected immediately
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return allItems.find((i) => i.id === selectedItemId) ?? null;
  }, [selectedItemId, allItems]);

  const compareItems = useCallback((a: MediaItem, b: MediaItem) => {
    if (sortMode === "year") {
      const yearDiff = (b.year ?? -Infinity) - (a.year ?? -Infinity);
      if (yearDiff !== 0) return yearDiff;
    }

    if (sortMode === "recent") {
      const aCreated = user ? Date.parse((dbItems?.find((item) => item.id === a.id)?.created_at ?? "") || "") : NaN;
      const bCreated = user ? Date.parse((dbItems?.find((item) => item.id === b.id)?.created_at ?? "") || "") : NaN;
      const recentDiff = (Number.isFinite(bCreated) ? bCreated : 0) - (Number.isFinite(aCreated) ? aCreated : 0);
      if (recentDiff !== 0) return recentDiff;
    }

    return getCollectorSortKey(a).localeCompare(getCollectorSortKey(b));
  }, [sortMode, user, dbItems]);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    allItems.forEach((item) => {
      const tags = (item.metadata as any)?.tags as string[] | undefined;
      if (tags) tags.forEach((t) => tagSet.add(t));
    });
    return [...tagSet].sort();
  }, [allItems]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => buildCollectionSearchText(i).includes(q));
    }
    if (activeFormats.length > 0) {
      items = items.filter((i) => {
        const itemFormats = i.formats && i.formats.length > 0 ? i.formats : i.format ? [i.format] : [];
        return itemFormats.some((format) => activeFormats.includes(format));
      });
    }
    if (activeTags.length > 0) {
      items = items.filter((i) => {
        const tags = (i.metadata as any)?.tags as string[] | undefined;
        if (!tags) return false;
        return activeTags.every((t) => tags.includes(t));
      });
    }
    if (statusFilter) {
      if (statusFilter === "plex") {
        items = items.filter((i) => i.inPlex);
      } else if (statusFilter === "digital") {
        items = items.filter((i) => i.digitalCopy);
      } else {
        // Format/platform filter from stats cards
        const kw = statusFilter.toLowerCase();
        items = items.filter((i) => {
          const formats = i.formats && i.formats.length > 0 ? i.formats : i.format ? [i.format] : [];
          const meta = i.metadata as Record<string, any> | undefined;
          const platforms = (meta?.platforms as string[]) ?? [];
          return [...formats, ...platforms].some((f) => f.toLowerCase().includes(kw));
        });
      }
    }
    return [...items].sort(compareItems);
  }, [allItems, searchQuery, activeFormats, activeTags, statusFilter, compareItems]);

  const availableLetters = useMemo(() => {
    if (sortMode !== "title") return new Set<string>();
    const letters = new Set<string>();
    filteredItems.forEach((item) => {
      letters.add(getCollectorGroupLetter(item));
    });
    return letters;
  }, [filteredItems, sortMode]);

  const groupedItems = useMemo(() => {
    const groups: Record<string, MediaItem[]> = {};
    filteredItems.forEach((item) => {
      const key = sortMode === "title" ? getCollectorGroupLetter(item) : "All";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filteredItems, sortMode]);

  const handleFormatToggle = useCallback((format: string) => {
    setActiveFormats((prev) =>
      prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]
    );
  }, []);

  const handleLetterClick = useCallback((letter: string) => {
    setActiveLetter(letter);
    const el = document.getElementById(`letter-${letter}`);
    if (el && scrollRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const handleTabChange = useCallback((tab: MediaTab) => {
    setActiveTab(tab);
    setSearchQuery("");
    setActiveFormats([]);
    setActiveTags([]);
    setStatusFilter(null);
    setActiveLetter(null);
  }, []);

  const handleTagToggle = useCallback((tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const handleStatsClick = useCallback((type: string) => {
    if (type === "total") {
      setStatusFilter(null);
      setActiveFormats([]);
      return;
    }
    setStatusFilter((prev) => (prev === type ? null : type));
    setActiveFormats([]);
  }, []);

  const sortedLetters = sortMode === "title" ? Object.keys(groupedItems).sort() : ["All"];

  const handleViewModeChange = useCallback((nextView: CollectionViewMode) => {
    setViewMode(nextView);
    localStorage.setItem("ds-default-view", JSON.stringify(nextView));
  }, []);

  const handleSortChange = useCallback((value: SortMode) => {
    setSortMode(value);
    localStorage.setItem("ds-default-sort", JSON.stringify(value));
    setActiveLetter(null);
  }, []);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header — always visible, no scroll */}
      <header className="flex-none z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2 min-w-0">
            <MobileMenu
              isLoggedIn={!!user}
              onSignOut={signOut}
              allItems={dbItems ?? []}
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
                <BulkScanDialog activeTab={activeTab} />
                <RandomizerDialog items={filteredItems} />
                <ImportDialog activeTab={activeTab} />
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
        <div className="px-3 pb-1 sm:px-4 sm:pb-2 flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <FilterBar
              activeTab={activeTab}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              activeFormats={activeFormats}
              onFormatToggle={handleFormatToggle}
              availableTags={availableTags}
              activeTags={activeTags}
              onTagToggle={handleTagToggle}
            />
          </div>
          {/* Mobile: dropdown sits next to search */}
          <div className="md:hidden shrink-0">
            {sortMode === "title" && (
              <AlphabetRail
                activeLetter={activeLetter}
                onLetterClick={handleLetterClick}
                availableLetters={availableLetters}
                onClearLetter={() => setActiveLetter(null)}
              />
            )}
          </div>
        </div>
        {/* Desktop: horizontal rail */}
        {sortMode === "title" && (
          <div className="hidden md:block px-2 sm:px-3 pb-2 border-b border-border/50">
            <AlphabetRail
              activeLetter={activeLetter}
              onLetterClick={handleLetterClick}
              availableLetters={availableLetters}
              onClearLetter={() => setActiveLetter(null)}
            />
          </div>
        )}
      </header>

      {/* Scrollable content area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-16 md:pb-0">
      {/* Collapsible Stats Ribbon */}
      {!user ? (
        <WelcomeSection />
      ) : (
        <div
          className={`transition-all duration-300 ease-in-out ${
            headerPinned
              ? "sticky top-0 z-40 bg-background border-b border-border shadow-sm"
              : headerVisible
                ? "max-h-[300px] opacity-100"
                : "max-h-0 opacity-0 overflow-hidden"
          }`}
        >
          <div className="relative">
            <CollectionStats items={dbItems ?? []} isLoading={isLoading} activeTab={activeTab} onStatsClick={handleStatsClick} activeStatusFilter={statusFilter} />
            <button
              onClick={(e) => { e.stopPropagation(); toggleHeaderPin(); }}
              className="absolute top-7 right-5 z-10 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title={headerPinned ? "Unpin stats ribbon (will auto-hide on scroll)" : "Pin stats ribbon (stays visible on scroll)"}
            >
              {headerPinned ? <Pin className="h-4 w-4 text-primary" /> : <PinOff className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Item count + view toggle */}
      <div className="px-4 py-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isLoading ? "Loading..." : `${filteredItems.length} items`}
          {(activeFormats.length > 0 || activeTags.length > 0) && ` · Filtered`}
          {!user && " · Demo mode"}
        </p>
        <div className="flex items-center gap-2">
          <Select value={sortMode} onValueChange={(value: SortMode) => handleSortChange(value)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">Title</SelectItem>
              <SelectItem value="year">Year</SelectItem>
              <SelectItem value="recent">Recently Added</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 rounded-md border border-border bg-card p-1">
          <Button
            variant={viewMode === "vertical-cards" ? "secondary" : "ghost"}
            size="sm"
            className={viewMode === "vertical-cards" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}
            onClick={() => handleViewModeChange("vertical-cards")}
            title="Vertical cards"
          >
            <LayoutGrid className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Vertical</span>
          </Button>
          <Button
            variant={viewMode === "horizontal-cards" ? "secondary" : "ghost"}
            size="sm"
            className={viewMode === "horizontal-cards" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}
            onClick={() => handleViewModeChange("horizontal-cards")}
            title="Horizontal cards"
          >
            <Layers className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Horizontal</span>
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className={viewMode === "list" ? "text-foreground" : "text-muted-foreground hover:text-foreground"}
            onClick={() => handleViewModeChange("list")}
            title="List view"
          >
            <List className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">List</span>
          </Button>
          </div>
        </div>
      </div>

      {/* Grid / Cards / List */}
      <main className="px-4 pb-8" ref={gridRef}>
        {sortedLetters.map((letter) => (
          <div key={letter} id={`letter-${letter}`} className="mb-6">
            {sortMode === "title" && (
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 py-1">
                {letter}
              </h2>
            )}
            {viewMode === "vertical-cards" ? (
              <div className="poster-grid">
                {groupedItems[letter].map((item) => (
                  <PosterCard key={item.id} item={item} onClick={(i) => setSelectedItemId(i.id)} variant="vertical" />
                ))}
              </div>
            ) : viewMode === "horizontal-cards" ? (
              <div className="flex flex-col gap-3">
                {groupedItems[letter].map((item) => (
                  <PosterCard key={item.id} item={item} onClick={(i) => setSelectedItemId(i.id)} variant="horizontal" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col">
                {groupedItems[letter].map((item) => (
                  <ListRow key={item.id} item={item} onClick={(i) => setSelectedItemId(i.id)} />
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
      </div>

      {/* Mobile Bottom Tab Bar */}
      <MobileTabBar activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Detail Drawer */}
      <DetailDrawer
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItemId(null)}
        itemList={filteredItems}
        onNavigate={(i) => setSelectedItemId(i.id)}
      />
    </div>
  );
}
