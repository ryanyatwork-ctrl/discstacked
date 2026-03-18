import { useState, useMemo, useRef, useCallback } from "react";
import { MediaTab, MediaItem } from "@/lib/types";
import { generateMockData } from "@/lib/mock-data";
import { TabSwitcher } from "@/components/TabSwitcher";
import { FilterBar } from "@/components/FilterBar";
import { AlphabetRail } from "@/components/AlphabetRail";
import { PosterCard } from "@/components/PosterCard";
import { DetailDrawer } from "@/components/DetailDrawer";
import { MobileMenu } from "@/components/MobileMenu";
import { Users, Upload } from "lucide-react";
import logo from "@/assets/DiscStacked_Logo.png";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export default function Index() {
  const [activeTab, setActiveTab] = useState<MediaTab>("movies");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFormats, setActiveFormats] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const allItems = useMemo(() => generateMockData(activeTab), [activeTab]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => i.title.toLowerCase().includes(q));
    }
    if (activeFormats.length > 0) {
      items = items.filter((i) => i.format && activeFormats.includes(i.format));
    }
    return items.sort((a, b) => a.title.localeCompare(b.title));
  }, [allItems, searchQuery, activeFormats]);

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
    setActiveLetter(null);
  }, []);

  const sortedLetters = Object.keys(groupedItems).sort();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <MobileMenu />
            <h1 className="text-lg font-semibold text-primary tracking-tight">DiscStacked</h1>
          </div>
          <div className="flex items-center gap-2">
            <TabSwitcher activeTab={activeTab} onTabChange={handleTabChange} />
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => toast({ title: "Coming soon", description: "Sign in & friends features are not yet available." })}
            >
              <Users className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => toast({ title: "Sign in required", description: "Sign in to import your collection." })}
            >
              <Upload className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="px-4 pb-3">
          <FilterBar
            activeTab={activeTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeFormats={activeFormats}
            onFormatToggle={handleFormatToggle}
          />
        </div>
      </header>

      {/* Collection stats */}
      <div className="px-4 py-3 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {filteredItems.length} items
          {activeFormats.length > 0 && ` · Filtered`}
        </p>
      </div>

      {/* Grid */}
      <main className="px-4 pb-8 pr-8" ref={gridRef}>
        {sortedLetters.map((letter) => (
          <div key={letter} id={`letter-${letter}`} className="mb-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2 sticky top-[120px] bg-background/95 backdrop-blur-sm py-1 z-10">
              {letter}
            </h2>
            <div className="poster-grid">
              {groupedItems[letter].map((item) => (
                <PosterCard key={item.id} item={item} onClick={setSelectedItem} />
              ))}
            </div>
          </div>
        ))}
        {filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <p className="text-sm">No items found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters</p>
          </div>
        )}
      </main>

      {/* A-Z Rail */}
      <AlphabetRail
        activeLetter={activeLetter}
        onLetterClick={handleLetterClick}
        availableLetters={availableLetters}
      />

      {/* Detail Drawer */}
      <DetailDrawer
        item={selectedItem}
        open={!!selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
