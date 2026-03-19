// PosterCard component
import { useState } from "react";
import { motion } from "framer-motion";
import { MediaItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Monitor, Download, Eye, Heart, Disc, Disc3, Cloud } from "lucide-react";

interface PosterCardProps {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
}

export function PosterCard({ item, onClick }: PosterCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const hasPoster = item.posterUrl && !errored;

  const formatBadges = (item.formats && item.formats.length > 0 ? item.formats : item.format ? [item.format] : []);
  const physicalFormats = formatBadges.filter(f => f !== "Digital");
  const isDigitalOnly = formatBadges.length > 0 && physicalFormats.length === 0;

  const getFormatVariant = (f: string) =>
    f === "4K" ? "4k" as const
    : f === "Blu-ray" ? "bluray" as const
    : f === "DVD" ? "dvd" as const
    : f === "Vinyl" ? "vinyl" as const
    : f === "Digital" ? "digital" as const
    : "secondary" as const;

  return (
    <motion.div
      className="relative group cursor-pointer rounded-sm overflow-hidden bg-card aspect-[2/3]"
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.15 }}
      onClick={() => onClick(item)}
    >
      {hasPoster ? (
        <>
          {!loaded && (
            <div className="absolute inset-0 bg-secondary animate-pulse" />
          )}
          <img
            src={item.posterUrl}
            alt={item.title}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
            className={`w-full h-full object-cover transition-opacity duration-150 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-secondary flex flex-col items-center justify-center p-3 text-center gap-2">
          {isDigitalOnly ? (
            <Cloud className="w-10 h-10 text-muted-foreground/40" />
          ) : formatBadges.some(f => f === "Blu-ray" || f === "4K") ? (
            <Disc3 className="w-10 h-10 text-muted-foreground/40" />
          ) : (
            <Disc className="w-10 h-10 text-muted-foreground/40" />
          )}
          <p className="text-xs font-medium text-foreground leading-tight line-clamp-3">{item.title}</p>
          {item.year && <p className="text-[10px] text-muted-foreground">{item.year}</p>}
        </div>
      )}

      {/* Format badges */}
      {formatBadges.length > 0 && (
        <div className="absolute top-1.5 left-1.5 flex flex-col gap-0.5">
          {formatBadges.map((f) => (
            <Badge key={f} variant={getFormatVariant(f)}>{f}</Badge>
          ))}
        </div>
      )}

      {/* Status icons */}
      <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
        {item.inPlex && (
          <div className="w-5 h-5 rounded-sm bg-primary/90 flex items-center justify-center" title="In Plex">
            <Monitor className="w-3 h-3 text-primary-foreground" />
          </div>
        )}
        {item.digitalCopy && (
          <div className="w-5 h-5 rounded-sm bg-success/90 flex items-center justify-center" title="Digital Copy">
            <Download className="w-3 h-3 text-foreground" />
          </div>
        )}
        {item.wishlist && (
          <div className="w-5 h-5 rounded-sm bg-destructive/90 flex items-center justify-center" title="Wishlist">
            <Heart className="w-3 h-3 text-foreground" />
          </div>
        )}
        {item.wantToWatch && (
          <div className="w-5 h-5 rounded-sm bg-accent/90 flex items-center justify-center" title="Want to Watch">
            <Eye className="w-3 h-3 text-foreground" />
          </div>
        )}
      </div>

      {/* Hover overlay - only on poster cards */}
      {hasPoster && (
        <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex items-end p-2">
          <div>
            <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">{item.title}</p>
            {item.year && <p className="text-[10px] text-muted-foreground mt-0.5">{item.year}</p>}
          </div>
        </div>
      )}
    </motion.div>
  );
}
