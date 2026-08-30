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
      return <ArrowUpDown className="w-3 h-3 opacity-30 group-hover:opacity-80" />;
    }
    return sortDir === "asc" ? (
      <ArrowUp className="w-3 h-3 text-primary" />
    ) : (
      <ArrowDown className="w-3 h-3 text-primary" />
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full bg-background overflow-hidden select-none">
      {/* Desktop Table Header Bar */}
      <div className="h-9 shrink-0 bg-secondary/80 border-b border-border/80 hidden sm:flex items-center text-xs font-bold text-muted-foreground">
        {/* Thumbnail icon col */}
        <div className="w-10 shrink-0 px-2 text-center"></div>

        {/* Dynamic Columns */}
        {isMusic && (
          <div
            onClick={() => handleHeaderClick("artist")}
            className="w-48 lg:w-60 shrink-0 px-3 py-1.5 flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40"
          >
            <span className="truncate">Artist</span>
            {renderSortIcon("artist")}
          </div>
        )}

        <div
          onClick={() => handleHeaderClick("title")}
          className="flex-1 min-w-[160px] px-3 py-1.5 flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40"
        >
          <span className="truncate">Title</span>
          {renderSortIcon("title")}
        </div>

        <div
          onClick={() => handleHeaderClick("year")}
          className="w-20 shrink-0 px-2.5 py-1.5 flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40 text-center"
        >
          <span className="truncate">Year</span>
          {renderSortIcon("year")}
        </div>

        <div
          onClick={() => handleHeaderClick("format")}
          className="w-24 lg:w-28 shrink-0 px-3 py-1.5 flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40"
        >
          <span className="truncate">{isGame ? "Platform" : "Format"}</span>
          {renderSortIcon("format")}
        </div>

        {isMusic && (
          <>
            <div
              onClick={() => handleHeaderClick("genre")}
              className="w-32 lg:w-40 shrink-0 px-3 py-1.5 hidden md:flex items-center justify-between cursor-pointer hover:text-foreground group border-r border-border/40"
            >
              <span className="truncate">Genre</span>
              {renderSortIcon("genre")}
            </div>
            <div
              onClick={() => handleHeaderClick("label")}
              className="w-36 lg:w-48 shrink-0 px-3 py-1.5 hidden lg:flex items-center justify-between cursor-pointer hover:text-foreground group"
            >
              <span className="truncate">Label</span>
              {renderSortIcon("label")}
            </div>
          </>
        )}

        {isVideo && (
          <div
            onClick={() => handleHeaderClick("genre")}
            className="w-32 lg:w-40 shrink-0 px-3 py-1.5 hidden md:flex items-center justify-between cursor-pointer hover:text-foreground group"
          >
            <span className="truncate">Genre</span>
            {renderSortIcon("genre")}
          </div>
        )}

        {isGame && (
          <div
            onClick={() => handleHeaderClick("genre")}
            className="w-32 lg:w-40 shrink-0 px-3 py-1.5 hidden md:flex items-center justify-between cursor-pointer hover:text-foreground group"
          >
            <span className="truncate">Genre</span>
            {renderSortIcon("genre")}
          </div>
        )}
      </div>

      {/* Table Body / Rows */}
      <div ref={tableContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden divide-y divide-border/30 scrollbar-thin">
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
                "min-h-[44px] sm:h-10 flex items-center px-2 sm:px-0 text-sm transition-colors cursor-pointer group",
                isSelected
                  ? "bg-primary/20 text-foreground font-semibold border-l-4 border-primary"
                  : idx % 2 === 0
                  ? "bg-card/40 hover:bg-secondary/80 text-foreground/90"
                  : "bg-card/15 hover:bg-secondary/80 text-foreground/90"
              )}
            >
              {/* Thumbnail / Status Icon */}
              <div className="w-10 sm:w-10 shrink-0 flex items-center justify-center">
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt=""
                    className={cn(
                      "object-cover rounded border border-border/60 shadow-xs",
                      isMusic ? "w-7 h-7" : "w-6 h-8"
                    )}
                    loading="lazy"
                  />
                ) : isMusic ? (
                  <Disc className="w-5 h-5 text-muted-foreground/60" />
                ) : isGame ? (
                  <Gamepad2 className="w-5 h-5 text-muted-foreground/60" />
                ) : (
                  <Film className="w-5 h-5 text-muted-foreground/60" />
                )}
              </div>

              {/* Mobile Card Row (visible on small screens) */}
              <div className="flex-1 min-w-0 sm:hidden py-2 pl-2 pr-1">
                {isMusic && artist && (
                  <div className="text-xs font-bold text-amber-400 truncate">
                    {artist}
                  </div>
                )}
                <div className="text-sm font-semibold text-foreground truncate">
                  {item.title}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                  {item.year && <span className="font-mono">{item.year}</span>}
                  {format && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-secondary font-medium text-foreground">
                      {format}
                    </span>
                  )}
                  {genre && <span className="truncate max-w-[120px]">{genre}</span>}
                </div>
              </div>

              {/* Desktop: Artist Column */}
              {isMusic && (
                <div className="hidden sm:block w-48 lg:w-60 shrink-0 px-3 truncate font-bold text-amber-400 group-hover:text-amber-300">
                  {artist || "—"}
                </div>
              )}

              {/* Desktop: Title Column */}
              <div className="hidden sm:block flex-1 min-w-[160px] px-3 truncate text-foreground font-medium">
                {item.title}
              </div>

              {/* Desktop: Year Column */}
              <div className="hidden sm:block w-20 shrink-0 px-2.5 truncate text-center text-muted-foreground font-mono text-xs">
                {item.year || "—"}
              </div>

              {/* Desktop: Format Column */}
              <div className="hidden sm:block w-24 lg:w-28 shrink-0 px-3 truncate">
                {format && (
                  <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-secondary text-secondary-foreground border border-border/60">
                    {format}
                  </span>
                )}
              </div>

              {/* Music: Genre & Label */}
              {isMusic && (
                <>
                  <div className="w-32 lg:w-40 shrink-0 px-3 truncate hidden md:block text-muted-foreground text-xs">
                    {genre || "—"}
                  </div>
                  <div className="w-36 lg:w-48 shrink-0 px-3 truncate hidden lg:block text-muted-foreground text-xs">
                    {label || "—"}
                  </div>
                </>
              )}

              {/* Video: Genre */}
              {isVideo && (
                <div className="w-32 lg:w-40 shrink-0 px-3 truncate hidden md:block text-muted-foreground text-xs">
                  {genre || "—"}
                </div>
              )}

              {/* Game: Genre */}
              {isGame && (
                <div className="w-32 lg:w-40 shrink-0 px-3 truncate hidden md:block text-muted-foreground text-xs">
                  {genre || "—"}
                </div>
              )}
            </div>
          );
        })}

        {sortedItems.length === 0 && (
          <div className="text-center py-20 text-sm text-muted-foreground">
            No items match the current filters.
          </div>
        )}
      </div>
    </div>
  );
}
