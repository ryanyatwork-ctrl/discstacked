import { MediaItem } from "@/lib/types";
import { getEditionLabel } from "@/lib/edition-utils";
import { Monitor, Download, Heart, Eye, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { hasCopyIssue } from "@/lib/collector-utils";

interface ListRowProps {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
}

export function ListRow({ item, onClick }: ListRowProps) {
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
    <button
      onClick={() => onClick(item)}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/60 transition-colors text-left group"
    >
      <span className="flex-1 text-sm font-medium text-foreground truncate">
        {item.title}
        {getEditionLabel(item.metadata) && (
          <span className="ml-1.5 text-[10px] text-primary font-normal">({getEditionLabel(item.metadata)})</span>
        )}
      </span>
      {item.year && <span className="text-xs text-muted-foreground shrink-0">{item.year}</span>}
      {formatBadges.length > 0 && (
        <div className="flex items-center gap-1 shrink-0 max-w-[10rem] flex-wrap justify-end">
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
      <div className="flex items-center gap-1 shrink-0">
        {item.inPlex && <Monitor className="w-3.5 h-3.5 text-primary" />}
        {item.digitalCopy && <Download className="w-3.5 h-3.5 text-success" />}
        {item.wishlist && <Heart className="w-3.5 h-3.5 text-destructive" />}
        {item.wantToWatch && <Eye className="w-3.5 h-3.5 text-accent" />}
      </div>
    </button>
  );
}
