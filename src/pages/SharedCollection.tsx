import { useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { usePublicProfile, usePublicCollection } from "@/hooks/useProfile";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PosterCard } from "@/components/PosterCard";
import { ListRow } from "@/components/ListRow";
import { MediaItem, MediaTab, FORMATS, TABS } from "@/lib/types";
import { AlphabetRail } from "@/components/AlphabetRail";
import { groupLetter, sortTitle, cn } from "@/lib/utils";
import { Search, X, LayoutGrid, List, Heart, Eye, ExternalLink, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SharedDetailDrawer } from "@/components/SharedDetailDrawer";
import logo from "@/assets/DiscStacked_16x9.png";

type ViewMode = "covers" | "list";
type StatusFilter = "wishlist" | "wantToWatch" | null;

export default function SharedCollection() {
  const { token } = useParams<{ token: string }>();
  const { data: profile, isLoading: profileLoading } = usePublicProfile(token);

  const sharedTabs = useMemo(() => {
    if (!profile?.shared_tabs || profile.shared_tabs.length === 0) return ["movies"];
    return profile.shared_tabs;
  }, [profile]);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const currentTab = activeTab && sharedTabs.includes(activeTab) ? activeTab : sharedTabs[0];

  const { data: items, isLoading: itemsLoading } = usePublicCollection(profile?.user_id, currentTab);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("covers");
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  const mediaItems = useMemo(() => {
    if (!items) return [];
    return items.map((db: any): MediaItem => ({
      id: db.id,
      title: db.title,
      sortTitle: db.sort_title ?? undefined,
      year: db.year ?? undefined,
      format: db.format ?? undefined,
      formats: db.formats?.length > 0 ? db.formats : db.format ? [db.format] : undefined,
      posterUrl: db.poster_url ?? undefined,
      genre: db.genre ?? undefined,
      rating: db.rating ?? undefined,
      notes: db.notes ?? undefined,
      mediaType: db.media_type as MediaTab,
      inPlex: db.in_plex,
      digitalCopy: db.digital_copy,
      wishlist: db.wishlist,
      wantToWatch: db.want_to_watch,
      barcode: db.barcode ?? undefined,
      totalCopies: db.total_copies ?? 1,
      metadata: db.metadata ?? undefined,
    }));
  }, [items]);

  const filteredItems = useMemo(() => {
    let result = mediaItems;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((i) => i.title.toLowerCase().includes(q));
    }
    if (activeFormats.length > 0) {
      result = result.filter((item) => {
        const itemFormats = item.formats && item.formats.length > 0 ? item.formats : item.format ? [item.format] : [];
        return itemFormats.some((f) => activeFormats.includes(f));
      });
    }
    if (statusFilter === "wishlist") {
      result = result.filter((i) => i.wishlist);
    } else if (statusFilter === "wantToWatch") {
      result = result.filter((i) => i.wantToWatch);
    }
    return result.sort((a, b) => sortTitle(a.title, a.sortTitle).localeCompare(sortTitle(b.title, b.sortTitle)));
  }, [mediaItems, activeFormats, searchQuery, statusFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, MediaItem[]> = {};
    filteredItems.forEach((item) => {
      const key = groupLetter(item.title, item.sortTitle);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filteredItems]);

  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    filteredItems.forEach((item) => letters.add(groupLetter(item.title, item.sortTitle)));
    return letters;
  }, [filteredItems]);

  const handleLetterClick = useCallback((letter: string) => {
    setActiveLetter(letter);
    const el = document.getElementById(`share-letter-${letter}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleFormatToggle = useCallback((format: string) => {
    setActiveFormats((prev) =>
      prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]
    );
  }, []);

  const availableFormats = useMemo(() => {
    const tabKey = currentTab as MediaTab;
    return FORMATS[tabKey] || [];
  }, [currentTab]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setActiveFormats([]);
    setActiveLetter(null);
    setSearchQuery("");
    setStatusFilter(null);
  }, []);

  const wishlistCount = useMemo(() => mediaItems.filter((i) => i.wishlist).length, [mediaItems]);
  const wantToWatchCount = useMemo(() => mediaItems.filter((i) => i.wantToWatch).length, [mediaItems]);

  if (profileLoading || itemsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading collection...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Collection not found</p>
      </div>
    );
  }

  const name = profile.display_name || "Someone";
  const initials = name.slice(0, 2).toUpperCase();
  const visibleTabs = TABS.filter((t) => sharedTabs.includes(t.id));

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 max-w-5xl mx-auto">
          <img src={logo} alt="DiscStacked" className="h-8 w-auto rounded object-contain" />
          <div className="flex items-center gap-2 ml-auto">
            <Avatar className="h-8 w-8">
              {profile.avatar_url && <AvatarImage src={profile.avatar_url} />}
              <AvatarFallback className="text-xs bg-secondary text-muted-foreground">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-foreground">{name}'s Collection</span>
          </div>
        </div>

        {/* Tab switcher */}
        {visibleTabs.length > 1 && (
          <div className="flex items-center gap-1 mt-2 max-w-5xl mx-auto overflow-x-auto">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 whitespace-nowrap flex items-center gap-1.5",
                  currentTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Search + format + status filters */}
        <div className="flex items-center gap-3 flex-wrap mt-2 max-w-5xl mx-auto">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search collection..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-8 rounded-md bg-secondary border-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {availableFormats.map((format) => (
              <button
                key={format}
                onClick={() => handleFormatToggle(format)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150",
                  activeFormats.includes(format)
                    ? format === "4K" ? "bg-primary text-primary-foreground"
                    : format === "Blu-ray" ? "bg-accent text-accent-foreground"
                    : "bg-secondary text-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                {format}
              </button>
            ))}
            {wishlistCount > 0 && (
              <button
                onClick={() => setStatusFilter((prev) => prev === "wishlist" ? null : "wishlist")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 flex items-center gap-1",
                  statusFilter === "wishlist"
                    ? "bg-destructive text-destructive-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Heart className="h-3 w-3" />
                Wishlist ({wishlistCount})
              </button>
            )}
            {wantToWatchCount > 0 && (
              <button
                onClick={() => setStatusFilter((prev) => prev === "wantToWatch" ? null : "wantToWatch")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150 flex items-center gap-1",
                  statusFilter === "wantToWatch"
                    ? "bg-accent text-accent-foreground"
                    : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <Eye className="h-3 w-3" />
                Want to Watch ({wantToWatchCount})
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Item count + view toggle */}
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filteredItems.length} items
          {activeFormats.length > 0 && ` · Filtered`}
          {searchQuery && ` · "${searchQuery}"`}
          {statusFilter === "wishlist" && ` · Wishlist`}
          {statusFilter === "wantToWatch" && ` · Want to Watch`}
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
      <main className="max-w-5xl mx-auto px-4 pb-8 pr-8">
        {Object.keys(grouped).sort().map((letter) => (
          <div key={letter} id={`share-letter-${letter}`} className="mb-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 sticky top-[120px] bg-background/95 backdrop-blur-sm py-1 z-10">{letter}</h2>
            {viewMode === "covers" ? (
              <div className="poster-grid">
                {grouped[letter].map((item) => (
                  <PosterCard key={item.id} item={item} onClick={setSelectedItem} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col">
                {grouped[letter].map((item) => (
                  <ListRow key={item.id} item={item} onClick={setSelectedItem} />
                ))}
              </div>
            )}
          </div>
        ))}
        {filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <p className="text-sm">No items found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </main>

      <AlphabetRail
        activeLetter={activeLetter}
        onLetterClick={handleLetterClick}
        availableLetters={availableLetters}
      />

      {/* Shared Detail Drawer (read-only) */}
      <SharedDetailDrawer
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        itemList={filteredItems}
        onNavigate={setSelectedItem}
      />
    </div>
  );
}

