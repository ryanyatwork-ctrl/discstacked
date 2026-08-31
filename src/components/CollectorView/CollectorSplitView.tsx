import { useState, useMemo, useEffect } from "react";
import { MediaItem, MediaTab } from "@/lib/types";
import { FolderSidebar } from "./FolderSidebar";
import { CollectorDataGrid } from "./CollectorDataGrid";
import { CollectorDetailPanel } from "./CollectorDetailPanel";
import { Folder, ChevronDown, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollectorSplitViewProps {
  items: MediaItem[];
  activeTab: MediaTab;
  activeLetter: string | null;
  onLetterSelect: (letter: string | null) => void;
  onEditItem?: (item: MediaItem) => void;
  onToggleStatus?: (item: MediaItem, field: "inPlex" | "digitalCopy" | "wishlist") => void;
  onSearchArtwork?: (item: MediaItem) => void;
}

export function CollectorSplitView({
  items,
  activeTab,
  activeLetter,
  onLetterSelect,
  onEditItem,
  onToggleStatus,
  onSearchArtwork,
}: CollectorSplitViewProps) {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [mobileFolderOpen, setMobileFolderOpen] = useState(false);
  const [folderCollapsed, setFolderCollapsed] = useState(false);

  // Folder groups for mobile dropdown and sidebar
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
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { sensitivity: "base", numeric: true })
    );
  }, [items, activeTab]);

  // Filter items based on selected folder and letter
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Folder match
      if (selectedFolder !== null) {
        let folderKey = "";
        if (activeTab === "cds" || activeTab === "music") {
          folderKey = (item.artist || (item.metadata as any)?.artist || "Unknown Artist").trim();
        } else if (activeTab === "games") {
          folderKey = item.format || (item.formats && item.formats[0]) || "Unknown Platform";
        } else if (activeTab === "movies" || activeTab === "tv") {
          folderKey = item.format || (item.formats && item.formats[0]) || "Unknown Format";
        } else {
          folderKey = item.genre || "Other";
        }

        if (folderKey !== selectedFolder) return false;
      }

      // 2. Letter match
      if (activeLetter !== null) {
        let firstChar = "";
        if (activeTab === "cds" || activeTab === "music") {
          firstChar = (item.artist || item.title || "").trim().charAt(0).toUpperCase();
        } else {
          firstChar = item.title.trim().charAt(0).toUpperCase();
        }

        if (activeLetter === "#") {
          if (/[A-Z]/.test(firstChar)) return false;
        } else {
          if (firstChar !== activeLetter) return false;
        }
      }

      return true;
    });
  }, [items, activeTab, selectedFolder, activeLetter]);

  // Automatically select the first item when items change if nothing selected
  useEffect(() => {
    if (filteredItems.length > 0) {
      if (!selectedItem || !filteredItems.some((i) => i.id === selectedItem.id)) {
        setSelectedItem(filteredItems[0]);
      }
    } else {
      setSelectedItem(null);
    }
  }, [filteredItems]);

  const handleItemSelect = (item: MediaItem) => {
    setSelectedItem(item);
    // On small screens, tapping opens the full detail drawer
    if (window.innerWidth < 1024 && onEditItem) {
      onEditItem(item);
    }
  };

  const getFolderTypeLabel = () => {
    if (activeTab === "cds" || activeTab === "music") return "Artists";
    if (activeTab === "games") return "Platforms";
    if (activeTab === "movies" || activeTab === "tv") return "Formats";
    return "Categories";
  };

  return (
    <div className="w-full h-[calc(100vh-140px)] min-h-[500px] flex flex-col bg-background rounded-lg border border-border/80 shadow-md overflow-hidden">
      {/* Mobile Folder Selector Bar (< md) */}
      <div className="md:hidden p-2 bg-secondary/60 border-b border-border/60 flex items-center justify-between gap-2">
        <button
          onClick={() => setMobileFolderOpen((prev) => !prev)}
          className="flex-1 flex items-center justify-between px-3 py-2 rounded bg-card border border-border/60 text-xs font-bold text-foreground"
        >
          <div className="flex items-center gap-2 truncate">
            <Folder className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">
              {selectedFolder ? `${getFolderTypeLabel()}: ${selectedFolder}` : `All ${getFolderTypeLabel()} (${items.length})`}
            </span>
          </div>
          <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform shrink-0", mobileFolderOpen ? "rotate-180" : "")} />
        </button>

        {selectedFolder && (
          <button
            onClick={() => setSelectedFolder(null)}
            className="px-2.5 py-2 rounded bg-secondary text-xs text-primary font-bold hover:bg-secondary/80 shrink-0"
          >
            Clear
          </button>
        )}
      </div>

      {/* Mobile Folder Dropdown Drawer (< md) */}
      {mobileFolderOpen && (
        <div className="md:hidden max-h-56 overflow-y-auto p-2 bg-card border-b border-border/80 divide-y divide-border/20 scrollbar-thin">
          <button
            onClick={() => {
              setSelectedFolder(null);
              setMobileFolderOpen(false);
            }}
            className={cn(
              "w-full text-left py-2.5 px-2.5 text-xs font-semibold rounded flex justify-between",
              selectedFolder === null ? "text-primary font-bold bg-primary/10" : "text-foreground"
            )}
          >
            <span>All {activeTab.toUpperCase()}</span>
            <span className="font-mono text-muted-foreground text-xs">{items.length}</span>
          </button>
          {folderGroups.map(([name, count]) => (
            <button
              key={name}
              onClick={() => {
                setSelectedFolder(name);
                setMobileFolderOpen(false);
              }}
              className={cn(
                "w-full text-left py-2.5 px-2.5 text-xs font-medium rounded flex justify-between",
                selectedFolder === name ? "text-primary font-bold bg-primary/10" : "text-foreground/90"
              )}
            >
              <span className="truncate pr-2">{name}</span>
              <span className="font-mono text-muted-foreground text-xs shrink-0">{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* 3-Panel Responsive Split Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Desktop Expand Button when sidebar is collapsed */}
        {folderCollapsed && (
          <button
            onClick={() => setFolderCollapsed(false)}
            className="hidden md:flex absolute left-2 top-2 z-10 p-1.5 rounded-md bg-secondary/90 border border-border shadow-xs text-muted-foreground hover:text-foreground items-center gap-1 text-xs font-semibold"
            title="Expand Folders Sidebar"
          >
            <PanelLeftOpen className="w-3.5 h-3.5 text-primary" />
            <span>Folders</span>
          </button>
        )}

        {/* Left: Folder Tree Sidebar (Visible on tablet & desktop >= md when not collapsed) */}
        {!folderCollapsed && (
          <div className="hidden md:flex shrink-0">
            <FolderSidebar
              items={items}
              activeTab={activeTab}
              selectedFolder={selectedFolder}
              onSelectFolder={setSelectedFolder}
              onCollapse={() => setFolderCollapsed(true)}
            />
          </div>
        )}

        {/* Middle: Interactive Tabular Data Grid (Full width on mobile, middle column on desktop) */}
        <CollectorDataGrid
          items={filteredItems}
          activeTab={activeTab}
          selectedId={selectedItem?.id || null}
          onSelectItem={handleItemSelect}
        />

        {/* Right: Rich Detail & Media Showcase (Visible on desktop >= lg) */}
        <div className="hidden lg:flex shrink-0">
          <CollectorDetailPanel
            item={selectedItem}
            activeTab={activeTab}
            onEdit={onEditItem}
            onToggleStatus={onToggleStatus}
            onSearchArtwork={onSearchArtwork}
          />
        </div>
      </div>
    </div>
  );
}
