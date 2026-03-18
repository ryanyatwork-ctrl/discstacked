import { MediaItem } from "@/lib/types";
import { Monitor, Download, Heart, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ListRowProps {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
}

export function ListRow({ item, onClick }: ListRowProps) {
  const formatVariant = item.format === "4K" ? "4k" as const
    : item.format === "Blu-ray" ? "bluray" as const
    : item.format === "DVD" ? "dvd" as const
    : item.format === "Vinyl" ? "vinyl" as const
    : "secondary" as const;

  return (
    <button
      onClick={() => onClick(item)}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/60 transition-colors text-left group"
    >
      <span className="flex-1 text-sm font-medium text-foreground truncate">{item.title}</span>
      {item.year && <span className="text-xs text-muted-foreground shrink-0">{item.year}</span>}
      {item.format && (
        <Badge variant={formatVariant} className="shrink-0 text-[10px]">{item.format}</Badge>
      )}
      <div className="flex items-center gap-1 shrink-0">
        {item.inPlex && <Monitor className="w-3.5 h-3.5 text-primary" />}
        {item.digitalCopy && <Download className="w-3.5 h-3.5 text-success" />}
        {item.wishlist && <Heart className="w-3.5 h-3.5 text-destructive" />}
        {item.wantToWatch && <Eye className="w-3.5 h-3.5 text-accent" />}
      </div>
    </button>
  );
}
