import { MediaItem } from "@/lib/types";
import { getEditionLabel } from "@/lib/edition-utils";
import { Monitor, Download, Heart, Eye, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { hasCopyIssue } from "@/lib/collector-utils";

interface ListRowProps {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
  onArtistClick?: (artist: string) => void;
}

export function ListRow({ item, onClick, onArtistClick }: ListRowProps) {
  const formatBadges = item.formats && item.formats.length > 0 ? item.formats : item.format ? [item.format] : [];
  const hasIssue = hasCopyIssue(item.metadata);
  const isUpgradeTarget = !!item.metadata?.upgrade_target;

  const getFormatVariant = (format: string) =>
    format === "4K" ? "4k" as const
    : format === "Blu-ray" ? "bluray" as const
    : format === "DVD" ? "dvd" as const
    : format === "Vinyl" ? "vinyl" as const
    : "secondary" as const;

  return (
    <div
      onClick={() => onClick(item)}
      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-secondary/60 transition-colors text-left cursor-pointer group"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm font-medium text-foreground truncate">
          {item.artist ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onArtistClick?.(item.artist!);
                }}
                className="font-semibold text-primary hover:underline hover:text-primary/80 transition-colors inline-block text-left"
                title={`Filter all items by ${item.artist}`}
              >
                {item.artist}
              </button>
              <span className="mx-1.5 text-muted-foreground font-normal">—</span>
              <span>{item.title}</span>
            </>
          ) : (
            item.title
          )}
          {getEditionLabel(item.metadata) && (
            <span className="ml-1.5 text-[10px] text-primary font-normal">({getEditionLabel(item.metadata)})</span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        {item.year && <span className="text-xs text-muted-foreground">{item.year}</span>}
        {formatBadges.length > 0 && (
          <div className="flex items-center gap-1">
            {formatBadges.map((format) => (
              <Badge key={format} variant={getFormatVariant(format)} className="text-[10px]">
                {format}
              </Badge>
            ))}
          </div>
        )}
        {hasIssue && (
          <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">
            <AlertTriangle className="w-3 h-3 mr-1" />
            {isUpgradeTarget ? "Upgrade" : "Incomplete"}
          </Badge>
        )}
        <div className="flex items-center gap-1">
          {item.inPlex && <Monitor className="w-3.5 h-3.5 text-primary" />}
          {item.digitalCopy && <Download className="w-3.5 h-3.5 text-success" />}
          {item.wishlist && <Heart className="w-3.5 h-3.5 text-destructive" />}
          {item.wantToWatch && <Eye className="w-3.5 h-3.5 text-accent" />}
        </div>
      </div>
    </div>
  );
}
