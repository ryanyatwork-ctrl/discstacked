import { useState, useRef, useEffect } from "react";
import { MediaItem } from "@/lib/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useUpdateItem } from "@/hooks/useMediaItems";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monitor, Download, Heart, Eye, ExternalLink, ImageIcon } from "lucide-react";
import { CoverSearchDialog } from "@/components/CoverSearchDialog";

interface DetailDrawerProps {
  item: MediaItem | null;
  open: boolean;
  onClose: () => void;
}

export function DetailDrawer({ item, open, onClose }: DetailDrawerProps) {
  const [coverSearchOpen, setCoverSearchOpen] = useState(false);

  if (!item) return null;

  const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(item.title)}+${encodeURIComponent(item.format || "")}&tag=bookstacked05-20`;

  const formats = item.formats && item.formats.length > 0 ? item.formats : item.format ? [item.format] : [];

  const getFormatVariant = (f: string) =>
    f === "4K" ? "4k" as const
    : f === "Blu-ray" ? "bluray" as const
    : "secondary" as const;

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
          <SheetHeader className="sr-only">
            <SheetTitle>{item.title}</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 pt-2">
            {/* Poster */}
            <div className="relative aspect-[2/3] w-full max-w-[280px] mx-auto rounded-md overflow-hidden">
              {item.posterUrl ? (
                <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-secondary flex flex-col items-center justify-center gap-3">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No cover art</p>
                </div>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="absolute bottom-2 right-2 gap-1.5 opacity-80 hover:opacity-100"
                onClick={() => setCoverSearchOpen(true)}
              >
                <ImageIcon className="w-3 h-3" />
                {item.posterUrl ? "Change" : "Find Cover"}
              </Button>
            </div>

            {/* Info */}
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-foreground">{item.title}</h2>
              <div className="flex items-center gap-2 flex-wrap">
                {item.year && <span className="text-sm text-muted-foreground">{item.year}</span>}
                {formats.map((f) => (
                  <Badge key={f} variant={getFormatVariant(f)}>{f}</Badge>
                ))}
              </div>
              {formats.length > 1 && (
                <p className="text-xs text-muted-foreground">
                  You own {formats.length} copies in different formats
                </p>
              )}
            </div>

            {/* Status flags */}
            <div className="grid grid-cols-2 gap-2">
              <StatusToggle icon={Monitor} label="In Plex" active={item.inPlex} color="primary" />
              <StatusToggle icon={Download} label="Digital Copy" active={item.digitalCopy} color="success" />
              <StatusToggle icon={Heart} label="Wishlist" active={item.wishlist} color="destructive" />
              <StatusToggle icon={Eye} label="Want to Watch" active={item.wantToWatch} color="accent" />
            </div>

            {/* Watch History */}
            {item.lastWatched && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Last Watched</p>
                <p className="text-sm text-foreground">{item.lastWatched}</p>
                {item.watchNotes && <p className="text-sm text-muted-foreground">{item.watchNotes}</p>}
              </div>
            )}

            {/* Amazon */}
            <Button
              variant="outline"
              className="w-full border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => window.open(amazonUrl, "_blank")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Find on Amazon
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Cover Search Dialog */}
      <CoverSearchDialog
        item={item}
        open={coverSearchOpen}
        onClose={() => setCoverSearchOpen(false)}
      />
    </>
  );
}

function StatusToggle({ icon: Icon, label, active, color }: { icon: any; label: string; active?: boolean; color: string }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-md border ${active ? "border-border bg-secondary" : "border-border/50 bg-card"}`}>
      <Icon className={`w-4 h-4 ${active ? `text-${color}` : "text-muted-foreground"}`} />
      <span className="text-xs text-foreground">{label}</span>
      <div className={`ml-auto w-2 h-2 rounded-full ${active ? "bg-success" : "bg-muted-foreground/30"}`} />
    </div>
  );
}
