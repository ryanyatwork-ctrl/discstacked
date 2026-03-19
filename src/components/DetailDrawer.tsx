import { useState, useRef, useEffect } from "react";
import { MediaItem, MediaTab, FORMATS } from "@/lib/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useUpdateItem, useDuplicateItem, DbMediaItem } from "@/hooks/useMediaItems";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monitor, Download, Heart, Eye, ExternalLink, ImageIcon, Pencil, Check, X, Package, Copy } from "lucide-react";
import { CoverSearchDialog } from "@/components/CoverSearchDialog";
import { FormatEditor } from "@/components/FormatEditor";

interface DetailDrawerProps {
  item: MediaItem | null;
  open: boolean;
  onClose: () => void;
  onDuplicated?: () => void;
}

export function DetailDrawer({ item, open, onClose, onDuplicated }: DetailDrawerProps) {
  const [coverSearchOpen, setCoverSearchOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>({});
  const [localFormats, setLocalFormats] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateItem = useUpdateItem();
  const duplicateItem = useDuplicateItem();

  // Reset local overrides when item changes
  useEffect(() => {
    setLocalFlags({});
    setLocalFormats(null);
  }, [item?.id]);

  useEffect(() => {
    if (editingTitle && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTitle]);

  if (!item) return null;

  const inPlex = localFlags.in_plex ?? item.inPlex;
  const digitalCopy = localFlags.digital_copy ?? item.digitalCopy;
  const wishlist = localFlags.wishlist ?? item.wishlist;
  const wantToWatch = localFlags.want_to_watch ?? item.wantToWatch;

  const handleSaveTitle = async () => {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === item.title) {
      setEditingTitle(false);
      return;
    }
    try {
      await updateItem.mutateAsync({ id: item.id, title: trimmed } as any);
      toast({ title: "Title updated!" });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
    setEditingTitle(false);
  };

  const handleToggle = async (field: "in_plex" | "digital_copy" | "wishlist" | "want_to_watch", value: boolean) => {
    setLocalFlags((prev) => ({ ...prev, [field]: value }));
    try {
      await updateItem.mutateAsync({ id: item.id, [field]: value } as any);
    } catch {
      setLocalFlags((prev) => ({ ...prev, [field]: !value }));
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

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
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    ref={inputRef}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveTitle();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    className="text-lg font-semibold"
                  />
                  <Button variant="ghost" size="icon" onClick={handleSaveTitle} className="shrink-0">
                    <Check className="w-4 h-4 text-success" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditingTitle(false)} className="shrink-0">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-start gap-2 group">
                  <h2 className="text-xl font-semibold text-foreground break-words min-w-0">{item.title}</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 h-7 w-7"
                    onClick={() => { setTitleDraft(item.title); setEditingTitle(true); }}
                  >
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                </div>
              )}
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

            {/* Box Set Sources */}
            <BoxSetSources item={item} />

            {/* Barcode */}
            {item.barcode && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">UPC / Barcode</p>
                <p className="text-sm text-foreground font-mono">{item.barcode}</p>
              </div>
            )}

            {/* Status flags */}
            <div className="grid grid-cols-2 gap-2">
              <StatusToggle icon={Monitor} label="In Plex" active={inPlex} color="primary"
                onToggle={() => handleToggle("in_plex", !inPlex)} />
              <StatusToggle icon={Download} label="Digital Copy" active={digitalCopy} color="success"
                onToggle={() => handleToggle("digital_copy", !digitalCopy)} />
              <StatusToggle icon={Heart} label="Wishlist" active={wishlist} color="destructive"
                onToggle={() => handleToggle("wishlist", !wishlist)} />
              <StatusToggle icon={Eye} label="Want to Watch" active={wantToWatch} color="accent"
                onToggle={() => handleToggle("want_to_watch", !wantToWatch)} />
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

function StatusToggle({ icon: Icon, label, active, color, onToggle, readOnly }: { icon: any; label: string; active?: boolean; color: string; onToggle?: () => void; readOnly?: boolean }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={readOnly}
      className={`flex items-center gap-2 px-3 py-2 rounded-md border transition-colors ${active ? "border-border bg-secondary" : "border-border/50 bg-card"} ${readOnly ? "cursor-default" : "cursor-pointer hover:bg-secondary/80"}`}
    >
      <Icon className={`w-4 h-4 ${active ? `text-${color}` : "text-muted-foreground"}`} />
      <span className="text-xs text-foreground">{label}</span>
      <div className={`ml-auto w-2 h-2 rounded-full ${active ? "bg-success" : "bg-muted-foreground/30"}`} />
    </button>
  );
}

function BoxSetSources({ item }: { item: MediaItem }) {
  const metadata = (item as any).metadata || {};
  let boxSets: { title: string; format: string }[] = [];
  try {
    boxSets = JSON.parse(metadata.box_sets || "[]");
  } catch {
    return null;
  }

  const totalCopies = parseInt(metadata.total_copies || "0", 10);
  const isSet = metadata.is_box_set === "true";
  let contents: string[] = [];
  try {
    contents = JSON.parse(metadata.contents || "[]");
  } catch {}

  if (boxSets.length === 0 && !isSet && totalCopies <= 1) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
        Physical Copies
      </p>

      {totalCopies > 1 && (
        <p className="text-sm text-foreground">
          You own <strong>{totalCopies}</strong> physical copies of this title
        </p>
      )}

      {/* Standalone ownership */}
      {boxSets.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-secondary">
            <Package className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-foreground">Standalone copy</span>
          </div>
          {boxSets.map((bs, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-secondary">
              <Package className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <span className="text-xs text-foreground block truncate">Part of: {bs.title}</span>
                <span className="text-[10px] text-muted-foreground">{bs.format}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Box set contents */}
      {isSet && contents.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Contains {contents.length} titles:</p>
          <div className="flex flex-wrap gap-1">
            {contents.map((c, i) => (
              <Badge key={i} variant="secondary" className="text-[10px]">{c}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
