import { useState, useMemo, useRef, useEffect } from "react";
import { MediaItem, MediaTab } from "@/lib/types";
import { ArrowUpDown, ArrowUp, ArrowDown, Disc, Film, Tv, Gamepad2, Star, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollectorDataGridProps {
  items: MediaItem[];
  activeTab: MediaTab;
  selectedId: string | null;
  onSelectItem: (item: MediaItem) => void;
}

type SortField = "artist" | "title" | "year" | "format" | "genre" | "rating" | "tracks" | "label";
type SortDirection = "asc" | "desc";

export function CollectorDataGrid({
  items,
  activeTab,
  selectedId,
  onSelectItem,
}: CollectorDataGridProps) {
  const [sortField, setSortField] = useState<SortField>(
    activeTab === "cds" || activeTab === "music" ? "artist" : "title"
  );
  const [sortDir, setSortDir] = useState<SortDirection>("asc");
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const isMusic = activeTab === "cds" || activeTab === "music";
  const isGame = activeTab === "games";
  const isVideo = activeTab === "movies" || activeTab === "tv";

  const handleHeaderClick = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      switch (sortField) {
        case "artist":
          valA = a.artist || (a.metadata as any)?.artist || "";
          valB = b.artist || (b.metadata as any)?.artist || "";
          break;
        case "title":
          valA = a.title || "";
          valB = b.title || "";
          break;
        case "year":
          valA = a.year || 0;
          valB = b.year || 0;
          break;
        case "format":
          valA = a.format || (a.formats && a.formats[0]) || "";
          valB = b.format || (b.formats && b.formats[0]) || "";
          break;
        case "genre":
          valA = a.genre || (a.metadata as any)?.genre || "";
          valB = b.genre || (b.metadata as any)?.genre || "";
          break;
        case "rating":
          valA = a.rating || 0;
          valB = b.rating || 0;
          break;
        case "tracks":
          valA = (a.metadata as any)?.tracks || (a.metadata as any)?.track_count || 0;
          valB = (b.metadata as any)?.tracks || (b.metadata as any)?.track_count || 0;
          break;
        case "label":
          valA = (a.metadata as any)?.label || (a.metadata as any)?.record_label || "";
          valB = (b.metadata as any)?.label || (b.metadata as any)?.record_label || "";
          break;
        default:
          valA = a.title || "";
          valB = b.title || "";
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortDir === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(valA || "").toLowerCase();
      const strB = String(valB || "").toLowerCase();
      const cmp = strA.localeCompare(strB, undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, sortField, sortDir]);

  // Keyboard navigation (ArrowUp / ArrowDown)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId || sortedItems.length === 0) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const currentIndex = sortedItems.findIndex(i => i.id === selectedId);
      if (currentIndex === -1) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = Math.min(sortedItems.length - 1, currentIndex + 1);
        onSelectItem(sortedItems[nextIndex]);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = Math.max(0, currentIndex - 1);
        onSelectItem(sortedItems[prevIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, sortedItems, onSelectItem]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-2.5 h-2.5 opacity-30 group-hover:opacity-80" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="w-2.5 h-2.5 text-primary" />
    ) : (
      <ArrowDown className="w-2.5 h-2.5 text-primary" />
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background overflow-hidden select-none">
      {/* Table Header Bar */}
      <div className="h-8 shrink-0 bg-secondary/70 border-b border-border/80 flex items-center text-[11px] font-semibold text-muted-foreground">
        {/* Thumbnail icon col */}
        <div className="w-8 shrink-0 px-2 text-center"></div>

        {/* Dynamic Columns */}
        {isMusic && (
          <div
            onClick={() => handleHeaderClick("artist")}
            className="w-44 md:w-56 shrink-0 px-2.5 py-1 flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40"
          >
            <span className="truncate">Artist</span>
            {renderSortIcon("artist")}
          </div>
        )}

        <div
          onClick={() => handleHeaderClick("title")}
          className="flex-1 min-w-[140px] px-2.5 py-1 flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40"
        >
          <span className="truncate">Title</span>
          {renderSortIcon("title")}
        </div>

        <div
          onClick={() => handleHeaderClick("year")}
          className="w-16 md:w-20 shrink-0 px-2 py-1 flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40 text-center"
        >
          <span className="truncate">Year</span>
          {renderSortIcon("year")}
        </div>

        <div
          onClick={() => handleHeaderClick("format")}
          className="w-20 md:w-24 shrink-0 px-2 py-1 flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40"
        >
          <span className="truncate">{isGame ? "Platform" : "Format"}</span>
          {renderSortIcon("format")}
        </div>

        {isMusic && (
          <>
            <div
              onClick={() => handleHeaderClick("genre")}
              className="w-28 md:w-36 shrink-0 px-2 py-1 hidden sm:flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40"
            >
              <span className="truncate">Genre</span>
              {renderSortIcon("genre")}
            </div>
            <div
              onClick={() => handleHeaderClick("label")}
              className="w-32 md:w-44 shrink-0 px-2 py-1 hidden md:flex items-center justify-between cursor-pointer hover:text-foreground group"
            >
              <span className="truncate">Label</span>
              {renderSortIcon("label")}
            </div>
          </>
        )}

        {isVideo && (
          <div
            onClick={() => handleHeaderClick("genre")}
            className="w-28 md:w-36 shrink-0 px-2 py-1 hidden sm:flex items-center justify-between cursor-pointer hover:text-foreground group"
          >
            <span className="truncate">Genre</span>
            {renderSortIcon("genre")}
          </div>
        )}

        {isGame && (
          <div
            onClick={() => handleHeaderClick("genre")}
            className="w-28 md:w-36 shrink-0 px-2 py-1 hidden sm:flex items-center justify-between cursor-pointer hover:text-foreground group"
          >
            <span className="truncate">Genre</span>
            {renderSortIcon("genre")}
          </div>
        )}
      </div>

      {/* Table Body / Rows */}
      <div ref={tableContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-border/20 scrollbar-thin">
        {sortedItems.map((item, idx) => {
          const isSelected = selectedId === item.id;
          const artist = item.artist || (item.metadata as any)?.artist || "";
          const genre = item.genre || (item.metadata as any)?.genre || "";
          const label = (item.metadata as any)?.label || (item.metadata as any)?.record_label || "";
          const format = item.format || (item.formats && item.formats[0]) || "";

          return (
            <div
              key={item.id}
              onClick={() => onSelectItem(item)}
              className={cn(
                "h-8 flex items-center text-xs transition-colors cursor-pointer group",
                isSelected
                  ? "bg-primary/20 text-foreground font-medium border-l-2 border-primary"
                  : idx % 2 === 0
                  ? "bg-card/30 hover:bg-secondary/70 text-foreground/90"
                  : "bg-card/10 hover:bg-secondary/70 text-foreground/90"
              )}
            >
              {/* Mini Icon / Status */}
              <div className="w-8 shrink-0 flex items-center justify-center">
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt=""
                    className="w-4 h-4 object-cover rounded-[2px] border border-border/50"
                    loading="lazy"
                  />
                ) : isMusic ? (
                  <Disc className="w-3.5 h-3.5 text-muted-foreground/60" />
                ) : isGame ? (
                  <Gamepad2 className="w-3.5 h-3.5 text-muted-foreground/60" />
                ) : (
                  <Film className="w-3.5 h-3.5 text-muted-foreground/60" />
                )}
              </div>

              {/* Artist Column */}
              {isMusic && (
                <div className="w-44 md:w-56 shrink-0 px-2.5 truncate font-semibold text-amber-400/90 group-hover:text-amber-300">
                  {artist || "—"}
                </div>
              )}

              {/* Title Column */}
              <div className="flex-1 min-w-[140px] px-2.5 truncate text-foreground">
                {item.title}
              </div>

              {/* Year Column */}
              <div className="w-16 md:w-20 shrink-0 px-2 truncate text-center text-muted-foreground font-mono text-[11px]">
                {item.year || "—"}
              </div>

              {/* Format Column */}
              <div className="w-20 md:w-24 shrink-0 px-2 truncate">
                {format && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-secondary text-secondary-foreground border border-border/50">
                    {format}
                  </span>
                )}
              </div>

              {/* Music: Genre & Label */}
              {isMusic && (
                <>
                  <div className="w-28 md:w-36 shrink-0 px-2 truncate hidden sm:block text-muted-foreground text-[11px]">
                    {genre || "—"}
                  </div>
                  <div className="w-32 md:w-44 shrink-0 px-2 truncate hidden md:block text-muted-foreground text-[11px]">
                    {label || "—"}
                  </div>
                </>
              )}

              {/* Video: Genre */}
              {isVideo && (
                <div className="w-28 md:w-36 shrink-0 px-2 truncate hidden sm:block text-muted-foreground text-[11px]">
                  {genre || "—"}
                </div>
              )}

              {/* Game: Genre */}
              {isGame && (
                <div className="w-28 md:w-36 shrink-0 px-2 truncate hidden sm:block text-muted-foreground text-[11px]">
                  {genre || "—"}
                </div>
              )}
            </div>
          );
        })}

        {sortedItems.length === 0 && (
          <div className="text-center py-16 text-sm text-muted-foreground">
            No items match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
