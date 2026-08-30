import { useState, useMemo, useEffect } from "react";
import { MediaItem, MediaTab } from "@/lib/types";
import { FolderSidebar } from "./FolderSidebar";
import { CollectorDataGrid } from "./CollectorDataGrid";
import { CollectorDetailPanel } from "./CollectorDetailPanel";
import { AlphabetRail } from "@/components/AlphabetRail";
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

  // Available alphabet letters
  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    for (const item of items) {
      let firstChar = "";
      if (activeTab === "cds" || activeTab === "music") {
        firstChar = (item.artist || item.title || "").trim().charAt(0).toUpperCase();
      } else {
        firstChar = item.title.trim().charAt(0).toUpperCase();
      }
      if (/[A-Z]/.test(firstChar)) {
        letters.add(firstChar);
      } else if (/[0-9#]/.test(firstChar)) {
        letters.add("#");
      }
    }
    return letters;
  }, [items, activeTab]);

  // Filter items based on selected folder and letter
  const filteredItems = useMemo(() => {
    return items.filter(item => {
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
      if (!selectedItem || !filteredItems.some(i => i.id === selectedItem.id)) {
        setSelectedItem(filteredItems[0]);
      }
    } else {
      setSelectedItem(null);
    }
  }, [filteredItems]);

  return (
    <div className="w-full h-[calc(100vh-140px)] min-h-[560px] flex flex-col bg-background rounded-lg border border-border/80 shadow-md overflow-hidden">
      {/* Top Alphabet Jump Strip */}
      <div className="px-3 py-1 bg-secondary/50 border-b border-border/60 flex items-center justify-center shrink-0">
        <AlphabetRail
          activeLetter={activeLetter}
          onSelectLetter={onLetterSelect}
          availableLetters={availableLetters}
          isPinned={false}
        />
      </div>

      {/* 3-Panel Split Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left: Folder Tree Sidebar */}
        <FolderSidebar
          items={items}
          activeTab={activeTab}
          selectedFolder={selectedFolder}
          onSelectFolder={setSelectedFolder}
        />

        {/* Middle: Interactive Multi-Column Tabular Data Grid */}
        <CollectorDataGrid
          items={filteredItems}
          activeTab={activeTab}
          selectedId={selectedItem?.id || null}
          onSelectItem={setSelectedItem}
        />

        {/* Right: Rich Detail & Media Showcase */}
        <CollectorDetailPanel
          item={selectedItem}
          activeTab={activeTab}
          onEdit={onEditItem}
          onToggleStatus={onToggleStatus}
          onSearchArtwork={onSearchArtwork}
        />
      </div>
    </div>
  );
}
