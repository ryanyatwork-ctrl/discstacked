import { useState, useMemo } from "react";
import { MediaItem, MediaTab } from "@/lib/types";
import { Folder, FolderOpen, Search, Disc, Film, Tv, Gamepad2, Layers, Music } from "lucide-react";
import { cn } from "@/lib/utils";

interface FolderSidebarProps {
  items: MediaItem[];
  activeTab: MediaTab;
  selectedFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
}

export function FolderSidebar({
  items,
  activeTab,
  selectedFolder,
  onSelectFolder,
}: FolderSidebarProps) {
  const [filterText, setFilterText] = useState("");

  const folderGroups = useMemo(() => {
    const map = new Map<string, number>();

    for (const item of items) {
      let key = "";
      if (activeTab === "cds" || activeTab === "music") {
        key = (item.artist || (item.metadata as any)?.artist || "Unknown Artist").trim();
      } else if (activeTab === "games") {
        key = item.format || (item.formats && item.formats[0]) || "Unknown Platform";
      } else if (activeTab === "movies" || activeTab === "tv") {
        key = item.format || (item.formats && item.formats[0]) || "Unknown Format";
      } else {
        key = item.genre || "Other";
      }

      map.set(key, (map.get(key) || 0) + 1);
    }

    const sorted = Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { sensitivity: "base", numeric: true })
    );

    return sorted;
  }, [items, activeTab]);

  const filteredGroups = useMemo(() => {
    if (!filterText.trim()) return folderGroups;
    const q = filterText.toLowerCase();
    return folderGroups.filter(([name]) => name.toLowerCase().includes(q));
  }, [folderGroups, filterText]);

  const getTabFolderIcon = () => {
    switch (activeTab) {
      case "cds":
      case "music":
        return <Disc className="w-3.5 h-3.5 text-primary" />;
      case "movies":
        return <Film className="w-3.5 h-3.5 text-primary" />;
      case "tv":
        return <Tv className="w-3.5 h-3.5 text-primary" />;
      case "games":
        return <Gamepad2 className="w-3.5 h-3.5 text-primary" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-primary" />;
    }
  };

  const getFolderTypeLabel = () => {
    if (activeTab === "cds" || activeTab === "music") return "Artists";
    if (activeTab === "games") return "Platforms";
    if (activeTab === "movies" || activeTab === "tv") return "Formats";
    return "Categories";
  };

  return (
    <aside className="w-60 md:w-64 shrink-0 flex flex-col bg-card/60 border-r border-border/60 select-none h-full overflow-hidden">
      {/* Folder Header */}
      <div className="p-2 border-b border-border/50 bg-secondary/30 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {getTabFolderIcon()}
          <span>{getFolderTypeLabel()}</span>
          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded font-mono">
            {folderGroups.length}
          </span>
        </div>
      </div>

      {/* Filter inside folders */}
      <div className="p-2 border-b border-border/40">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            placeholder={`Filter ${getFolderTypeLabel().toLowerCase()}...`}
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full h-7 pl-7 pr-2 text-xs rounded bg-secondary/80 border border-border/40 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Folder Tree List */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-1 space-y-0.5 scrollbar-thin">
        {/* All Items Folder */}
        <button
          onClick={() => onSelectFolder(null)}
          className={cn(
            "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors text-left",
            selectedFolder === null
              ? "bg-primary/20 text-primary font-semibold border-l-2 border-primary"
              : "text-foreground/90 hover:bg-secondary/60"
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {selectedFolder === null ? (
              <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="truncate">All {activeTab.toUpperCase()}</span>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-1">
            {items.length}
          </span>
        </button>

        {/* Group Folders */}
        {filteredGroups.map(([name, count]) => {
          const isSelected = selectedFolder === name;
          return (
            <button
              key={name}
              onClick={() => onSelectFolder(isSelected ? null : name)}
              className={cn(
                "w-full flex items-center justify-between px-2 py-1 rounded text-xs transition-colors text-left group",
                isSelected
                  ? "bg-primary/20 text-primary font-semibold border-l-2 border-primary"
                  : "text-foreground/80 hover:bg-secondary/60 hover:text-foreground"
              )}
              title={`${name} (${count})`}
            >
              <div className="flex items-center gap-1.5 truncate">
                {isSelected ? (
                  <FolderOpen className="w-3.5 h-3.5 text-primary shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary/70 shrink-0" />
                )}
                <span className="truncate">{name}</span>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-1">
                {count}
              </span>
            </button>
          );
        })}

        {filteredGroups.length === 0 && (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No matching {getFolderTypeLabel().toLowerCase()}
          </div>
        )}
      </div>
    </aside>
  );
}
