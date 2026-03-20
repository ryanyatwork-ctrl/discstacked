import { Search, X, Tag } from "lucide-react";
import { FORMATS, MediaTab } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface FilterBarProps {
  activeTab: MediaTab;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFormats: string[];
  onFormatToggle: (format: string) => void;
  availableTags?: string[];
  activeTags?: string[];
  onTagToggle?: (tag: string) => void;
}

export function FilterBar({ activeTab, searchQuery, onSearchChange, activeFormats, onFormatToggle, availableTags = [], activeTags = [], onTagToggle }: FilterBarProps) {
  const formats = FORMATS[activeTab];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search collection..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full h-9 pl-9 pr-8 rounded-md bg-secondary border-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button onClick={() => onSearchChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {formats.map((format) => (
            <button
              key={format}
              onClick={() => onFormatToggle(format)}
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
      </div>
      {availableTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
          {availableTags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagToggle?.(tag)}
              className={cn(
                "px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors duration-150",
                activeTags.includes(tag)
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
