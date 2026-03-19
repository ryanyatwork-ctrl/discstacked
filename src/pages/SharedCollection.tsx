import { useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { usePublicProfile, usePublicCollection } from "@/hooks/useProfile";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { PosterCard } from "@/components/PosterCard";
import { MediaItem, MediaTab, FORMATS, TABS } from "@/lib/types";
import { AlphabetRail } from "@/components/AlphabetRail";
import { groupLetter, sortTitle, cn } from "@/lib/utils";
import logo from "@/assets/DiscStacked_16x9.png";

export default function SharedCollection() {
  const { token } = useParams<{ token: string }>();
  const { data: profile, isLoading: profileLoading } = usePublicProfile(token);

  // Determine which tabs are shared
  const sharedTabs = useMemo(() => {
    if (!profile?.shared_tabs || profile.shared_tabs.length === 0) return ["movies"];
    return profile.shared_tabs;
  }, [profile]);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  const currentTab = activeTab && sharedTabs.includes(activeTab) ? activeTab : sharedTabs[0];

  const { data: items, isLoading: itemsLoading } = usePublicCollection(profile?.user_id, currentTab);
  const [activeFormats, setActiveFormats] = useState<string[]>([]);

  const mediaItems = useMemo(() => {
    if (!items) return [];
    return items.map((db: any): MediaItem => ({
      id: db.id,
      title: db.title,
      year: db.year ?? undefined,
      format: db.format ?? undefined,
      formats: db.formats?.length > 0 ? db.formats : db.format ? [db.format] : undefined,
      posterUrl: db.poster_url ?? undefined,
      genre: db.genre ?? undefined,
      rating: db.rating ?? undefined,
      mediaType: db.media_type as MediaTab,
      inPlex: db.in_plex,
      digitalCopy: db.digital_copy,
      wishlist: db.wishlist,
      wantToWatch: db.want_to_watch,
    }));
  }, [items]);

  const filteredItems = useMemo(() => {
    if (activeFormats.length === 0) return mediaItems;
    return mediaItems.filter((item) => {
      const itemFormats = item.formats && item.formats.length > 0 ? item.formats : item.format ? [item.format] : [];
      return itemFormats.some((f) => activeFormats.includes(f));
    });
  }, [mediaItems, activeFormats]);

  const grouped = useMemo(() => {
    const sorted = [...filteredItems].sort((a, b) => sortTitle(a.title).localeCompare(sortTitle(b.title)));
    const groups: Record<string, MediaItem[]> = {};
    sorted.forEach((item) => {
      const key = groupLetter(item.title);
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

  // Available formats for the current tab
  const availableFormats = useMemo(() => {
    const tabKey = currentTab as MediaTab;
    return FORMATS[tabKey] || [];
  }, [currentTab]);

  const handleTabChange = useCallback((tab: string) => {
    setActiveTab(tab);
    setActiveFormats([]);
  }, []);

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

        {/* Tab switcher - only show if more than one shared tab */}
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

        {/* Format filter toggles */}
        {availableFormats.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 max-w-5xl mx-auto">
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
          </div>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-4 py-4">
        <p className="text-xs text-muted-foreground mb-4">
          {filteredItems.length} items
          {activeFormats.length > 0 && ` · Filtered`}
        </p>
        {Object.keys(grouped).sort().map((letter) => (
          <div key={letter} className="mb-6">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">{letter}</h2>
            <div className="poster-grid">
              {grouped[letter].map((item) => (
                <PosterCard key={item.id} item={item} onClick={() => {}} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
