import { Search, X, Tag, SlidersHorizontal, Check } from "lucide-react";
import { FORMATS, MediaTab } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

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

const INLINE_THRESHOLD = 7;

export function FilterBar({ activeTab, searchQuery, onSearchChange, activeFormats, onFormatToggle, availableTags = [], activeTags = [], onTagToggle }: FilterBarProps) {
  const formats = FORMATS[activeTab];
  const useDropdown = formats.length > INLINE_THRESHOLD;

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

        {useDropdown ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs font-medium">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Platform
                {activeFormats.length > 0 && (
                  <span className="ml-1 rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[10px] leading-none font-bold">
                    {activeFormats.length}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="start">
              <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto">
                {formats.map((format) => {
                  const isActive = activeFormats.includes(format);
                  return (
                    <button
                      key={format}
                      onClick={() => onFormatToggle(format)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors text-left",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-secondary text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className={cn(
                        "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                        isActive ? "border-primary-foreground" : "border-muted-foreground/40"
                      )}>
                        {isActive && <Check className="h-2.5 w-2.5" />}
                      </span>
                      {format}
                    </button>
                  );
                })}
              </div>
              {activeFormats.length > 0 && (
                <button
                  onClick={() => activeFormats.forEach((f) => onFormatToggle(f))}
                  className="w-full mt-2 pt-2 border-t border-border text-xs text-muted-foreground hover:text-foreground text-center"
                >
                  Clear all
                </button>
              )}
            </PopoverContent>
          </Popover>
        ) : (
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
        )}
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