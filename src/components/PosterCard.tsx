// PosterCard component
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { MediaItem } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Monitor, Download, Eye, Heart, Disc, Disc3, Cloud, AlertTriangle } from "lucide-react";
import { getEditionLabel } from "@/lib/edition-utils";
import { hasCopyIssue } from "@/lib/collector-utils";
import { getFallbackPosterUrl, isPackageArtwork } from "@/lib/cover-utils";

interface PosterCardProps {
  item: MediaItem;
  onClick: (item: MediaItem) => void;
  variant?: "vertical" | "horizontal";
}

export function PosterCard({ item, onClick, variant = "vertical" }: PosterCardProps) {
  const [loaded, setLoaded] = useState(false);
  const [displaySrc, setDisplaySrc] = useState<string | null>(item.posterUrl || null);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const fallbackSrc = getFallbackPosterUrl(item);
  const hasPoster = !!displaySrc;

  useEffect(() => {
    setLoaded(false);
    setDisplaySrc(item.posterUrl || null);
    setFailedSources([]);
  }, [item.id, item.posterUrl]);

  const formatBadges = (item.formats && item.formats.length > 0 ? item.formats : item.format ? [item.format] : []);
  const physicalFormats = formatBadges.filter(f => f !== "Digital");
  const isDigitalOnly = formatBadges.length > 0 && physicalFormats.length === 0;
  const hasIssue = hasCopyIssue(item.metadata);
  const isUpgradeTarget = !!item.metadata?.upgrade_target;
  const useContainFit = isPackageArtwork(item, displaySrc);
  const editionLabel = getEditionLabel(item.metadata);

  const handleImageError = () => {
    if (displaySrc && fallbackSrc && displaySrc !== fallbackSrc && !failedSources.includes(fallbackSrc)) {
      setFailedSources((prev) => [...prev, displaySrc]);
      setLoaded(false);
      setDisplaySrc(fallbackSrc);
      return;
    }

    if (displaySrc) {
      setFailedSources((prev) => [...prev, displaySrc]);
    }
    setDisplaySrc(null);
  };

  const getFormatVariant = (f: string) =>
    f === "4K" ? "4k" as const
    : f === "Blu-ray" ? "bluray" as const
    : f === "DVD" ? "dvd" as const
    : f === "Vinyl" ? "vinyl" as const
    : f === "Digital" ? "digital" as const
    : "secondary" as const;

  if (variant === "horizontal") {
    return (
      <motion.button
        className="w-full group cursor-pointer overflow-hidden rounded-md border border-border bg-card text-left"
        whileHover={{ scale: 1.01 }}
        transition={{ duration: 0.15 }}
        onClick={() => onClick(item)}
      >
        <div className="flex min-h-[10rem]">
          <div className="relative w-24 shrink-0 overflow-hidden bg-secondary sm:w-28">
            {hasPoster ? (
              <>
                {!loaded && <div className="absolute inset-0 bg-secondary animate-pulse" />}
                <img
                  src={displaySrc!}
                  alt={item.title}
                  loading="lazy"
                  onLoad={() => setLoaded(true)}
                  onError={handleImageError}
                  className={`h-full w-full transition-opacity duration-150 ${useContainFit ? "object-contain bg-card" : "object-cover"} ${loaded ? "opacity-100" : "opacity-0"}`}
                />
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                {isDigitalOnly ? (
                  <Cloud className="h-8 w-8 text-muted-foreground/40" />
                ) : formatBadges.some((f) => f === "Blu-ray" || f === "4K") ? (
                  <Disc3 className="h-8 w-8 text-muted-foreground/40" />
                ) : (
                  <Disc className="h-8 w-8 text-muted-foreground/40" />
                )}
              </div>
            )}

            {formatBadges.length > 0 && (
              <div className="absolute top-1.5 left-1.5 flex flex-col gap-0.5">
                {formatBadges.map((f) => (
                  <Badge key={f} variant={getFormatVariant(f)}>{f}</Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-between p-3">
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight text-foreground line-clamp-2">{item.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    {item.year && <span>{item.year}</span>}
                    {item.genre && <span className="line-clamp-1">{item.genre}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {item.inPlex && <Monitor className="h-3.5 w-3.5 text-primary" />}
                  {item.digitalCopy && <Download className="h-3.5 w-3.5 text-success" />}
                  {item.wishlist && <Heart className="h-3.5 w-3.5 text-destructive" />}
                  {item.wantToWatch && <Eye className="h-3.5 w-3.5 text-accent" />}
                </div>
              </div>

              {editionLabel && (
                <p className="text-xs text-primary line-clamp-2">{editionLabel}</p>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {hasIssue && (
                <Badge variant="outline" className="border-warning/40 text-warning">
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  {isUpgradeTarget ? "Upgrade" : "Incomplete"}
                </Badge>
              )}
              {formatBadges.map((f) => (
                <Badge key={f} variant={getFormatVariant(f)}>
                  {f}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </motion.button>
    );
  }

  return (
    <motion.div
      className="group cursor-pointer overflow-hidden rounded-md border border-border bg-card"
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.15 }}
      onClick={() => onClick(item)}
    >
      <div className="relative aspect-[2/3] overflow-hidden bg-secondary">
        {hasPoster ? (
          <>
            {!loaded && <div className="absolute inset-0 bg-secondary animate-pulse" />}
            <img
              src={displaySrc!}
              alt={item.title}
              loading="lazy"
              onLoad={() => setLoaded(true)}
              onError={handleImageError}
              className={`h-full w-full transition-opacity duration-150 ${useContainFit ? "object-contain bg-card" : "object-cover"} ${loaded ? "opacity-100" : "opacity-0"}`}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
            {isDigitalOnly ? (
              <Cloud className="h-10 w-10 text-muted-foreground/40" />
            ) : formatBadges.some((f) => f === "Blu-ray" || f === "4K") ? (
              <Disc3 className="h-10 w-10 text-muted-foreground/40" />
            ) : (
              <Disc className="h-10 w-10 text-muted-foreground/40" />
            )}
          </div>
        )}

        {formatBadges.length > 0 && (
          <div className="absolute top-1.5 left-1.5 flex flex-col gap-0.5">
            {formatBadges.map((f) => (
              <Badge key={f} variant={getFormatVariant(f)}>{f}</Badge>
            ))}
          </div>
        )}

        <div className="absolute top-1.5 right-1.5 flex flex-col gap-1">
          {item.inPlex && (
            <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-primary/90" title="In Plex">
              <Monitor className="h-3 w-3 text-primary-foreground" />
            </div>
          )}
          {item.digitalCopy && (
            <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-success/90" title="Digital Copy">
              <Download className="h-3 w-3 text-foreground" />
            </div>
          )}
          {item.wishlist && (
            <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-destructive/90" title="Wishlist">
              <Heart className="h-3 w-3 text-foreground" />
            </div>
          )}
          {item.wantToWatch && (
            <div className="flex h-5 w-5 items-center justify-center rounded-sm bg-accent/90" title="Want to Watch">
              <Eye className="h-3 w-3 text-foreground" />
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 p-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight text-foreground line-clamp-2">{item.title}</p>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            {item.year ? <span>{item.year}</span> : <span />}
            {editionLabel && <span className="line-clamp-1 text-right text-primary">{editionLabel}</span>}
          </div>
        </div>

        {hasIssue && (
          <Badge variant="outline" className="border-warning/40 text-warning">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {isUpgradeTarget ? "Upgrade" : "Incomplete"}
          </Badge>
        )}
      </div>
    </motion.div>
  );
}
