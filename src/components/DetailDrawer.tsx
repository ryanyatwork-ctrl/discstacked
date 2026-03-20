import { useState, useRef, useEffect } from "react";
import { MediaItem, MediaTab, FORMATS } from "@/lib/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateItem, useDuplicateItem, useDeleteItem, DbMediaItem } from "@/hooks/useMediaItems";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monitor, Download, Heart, Eye, ExternalLink, ImageIcon, Pencil, Check, X, Package, Copy, CalendarCheck, ArrowDownAZ, Trash2, Layers } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
  const [editingYear, setEditingYear] = useState(false);
  const [yearDraft, setYearDraft] = useState("");
  const [editingSortTitle, setEditingSortTitle] = useState(false);
  const [sortTitleDraft, setSortTitleDraft] = useState("");
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>({});
  const [localFormats, setLocalFormats] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (editingYear && yearInputRef.current) {
      yearInputRef.current.focus();
      yearInputRef.current.select();
    }
  }, [editingYear]);

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

  const handleSaveYear = async () => {
    const parsed = yearDraft.trim() ? parseInt(yearDraft.trim()) : null;
    if (parsed === (item.year ?? null)) {
      setEditingYear(false);
      return;
    }
    if (yearDraft.trim() && (isNaN(parsed!) || parsed! < 1888 || parsed! > 2099)) {
      toast({ title: "Enter a valid year", variant: "destructive" });
      return;
    }
    try {
      await updateItem.mutateAsync({ id: item.id, year: parsed } as any);
      toast({ title: "Year updated!" });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
    setEditingYear(false);
  };

  const handleSaveSortTitle = async () => {
    const trimmed = sortTitleDraft.trim();
    const current = item.sortTitle || "";
    if (trimmed === current) {
      setEditingSortTitle(false);
      return;
    }
    try {
      await updateItem.mutateAsync({ id: item.id, sort_title: trimmed || null } as any);
      toast({ title: trimmed ? "Sort title updated!" : "Sort title removed" });
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
    setEditingSortTitle(false);
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

  const formats = localFormats ?? (item.formats && item.formats.length > 0 ? item.formats : item.format ? [item.format] : []);

  const mediaType = (item.mediaType || "movies") as MediaTab;

  const handleFormatToggle = async (format: string) => {
    const current = [...formats];
    const next = current.includes(format)
      ? current.filter((f) => f !== format)
      : [...current, format];
    if (next.length === 0) return; // must have at least one format
    setLocalFormats(next);
    try {
      await updateItem.mutateAsync({ id: item.id, formats: next, format: next[0] } as any);
    } catch {
      setLocalFormats(current);
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const handleDuplicate = async () => {
    try {
      // Build a raw DB-shaped object from the MediaItem
      const dbItem: any = {
        title: item.title,
        year: item.year ?? null,
        format: item.format ?? null,
        formats: formats,
        poster_url: item.posterUrl ?? null,
        genre: item.genre ?? null,
        rating: item.rating ?? null,
        notes: item.notes ?? null,
        in_plex: item.inPlex ?? false,
        digital_copy: item.digitalCopy ?? false,
        wishlist: item.wishlist ?? false,
        want_to_watch: item.wantToWatch ?? false,
        last_watched: item.lastWatched ?? null,
        watch_notes: item.watchNotes ?? null,
        media_type: item.mediaType ?? "movies",
        barcode: item.barcode ?? null,
        sort_title: item.sortTitle ?? null,
      };
      await duplicateItem.mutateAsync(dbItem);
      toast({ title: "Item duplicated", description: "Edit the copy to set the correct title and year." });
      onDuplicated?.();
    } catch {
      toast({ title: "Duplicate failed", variant: "destructive" });
    }
  };

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
              {editingYear ? (
                <div className="flex items-center gap-2">
                  <Input
                    ref={yearInputRef}
                    value={yearDraft}
                    onChange={(e) => setYearDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveYear(); if (e.key === "Escape") setEditingYear(false); }}
                    className="w-24 h-7 text-sm"
                    placeholder="Year"
                    type="number"
                    min={1888}
                    max={2099}
                  />
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={handleSaveYear}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingYear(false)}>Cancel</Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group/year">
                  <span
                    className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => { setYearDraft(String(item.year ?? "")); setEditingYear(true); }}
                  >
                    {item.year || "Add year"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover/year:opacity-100 transition-opacity h-6 w-6"
                    onClick={() => { setYearDraft(String(item.year ?? "")); setEditingYear(true); }}
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>

            {/* Sort Title */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                <ArrowDownAZ className="w-3 h-3" /> Sort As
              </p>
              {editingSortTitle ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={sortTitleDraft}
                    onChange={(e) => setSortTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveSortTitle();
                      if (e.key === "Escape") setEditingSortTitle(false);
                    }}
                    className="h-8 text-sm"
                    placeholder="e.g. Allegiant"
                    autoFocus
                  />
                  <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={handleSaveSortTitle}>
                    <Check className="w-4 h-4 text-success" />
                  </Button>
                  <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={() => setEditingSortTitle(false)}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 group/sort">
                  <span
                    className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                    onClick={() => { setSortTitleDraft(item.sortTitle || ""); setEditingSortTitle(true); }}
                  >
                    {item.sortTitle || "Same as title"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover/sort:opacity-100 transition-opacity h-6 w-6"
                    onClick={() => { setSortTitleDraft(item.sortTitle || ""); setEditingSortTitle(true); }}
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>

            <FormatEditor
              formats={formats}
              mediaType={mediaType}
              onToggle={handleFormatToggle}
            />

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
            <WatchHistory item={item} onUpdate={updateItem} />

            {/* Duplicate / Split */}
            <Button
              variant="outline"
              className="w-full border-border text-foreground hover:bg-secondary"
              onClick={handleDuplicate}
              disabled={duplicateItem.isPending}
            >
              <Copy className="w-4 h-4 mr-2" />
              {duplicateItem.isPending ? "Duplicating..." : "Duplicate as Separate Item"}
            </Button>

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

function WatchHistory({ item, onUpdate }: { item: MediaItem; onUpdate: ReturnType<typeof useUpdateItem> }) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [watchNote, setWatchNote] = useState("");

  const handleMarkWatched = async (note?: string) => {
    const today = new Date().toISOString().split("T")[0];
    try {
      const updates: any = { id: item.id, last_watched: today, want_to_watch: false };
      if (note?.trim()) updates.watch_notes = note.trim();
      await onUpdate.mutateAsync(updates);
      toast({ title: "Marked as watched!", description: `${item.title} — ${today}` });
      setShowNoteInput(false);
      setWatchNote("");
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Watch History</p>
      {item.lastWatched ? (
        <div className="space-y-1">
          <p className="text-sm text-foreground flex items-center gap-1.5">
            <CalendarCheck className="w-3.5 h-3.5 text-primary" />
            Last watched: {item.lastWatched}
          </p>
          {item.watchNotes && <p className="text-sm text-muted-foreground italic">"{item.watchNotes}"</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Not yet watched</p>
      )}
      {showNoteInput ? (
        <div className="space-y-2">
          <Textarea
            value={watchNote}
            onChange={(e) => setWatchNote(e.target.value)}
            placeholder="Any thoughts? (optional)"
            rows={2}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => handleMarkWatched(watchNote)} disabled={onUpdate.isPending} className="gap-1.5">
              <CalendarCheck className="w-3.5 h-3.5" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowNoteInput(false); setWatchNote(""); }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowNoteInput(true)}
          className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
        >
          <CalendarCheck className="w-3.5 h-3.5" />
          {item.lastWatched ? "Watched Again" : "Mark as Watched"}
        </Button>
      )}
    </div>
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
