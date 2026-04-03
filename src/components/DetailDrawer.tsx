import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { usePhysicalProductsForItem } from "@/hooks/usePhysicalProducts";
import { MediaItem, MediaTab, FORMATS } from "@/lib/types";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateItem, useDuplicateItem, useDeleteItem, DbMediaItem } from "@/hooks/useMediaItems";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Monitor, Download, Heart, Eye, ExternalLink, ImageIcon, Pencil, Check, X, Package, Copy, CalendarCheck, ArrowDownAZ, Trash2, Layers, Barcode, Clock, Tag, Camera, Loader2, ChevronLeft, ChevronRight, ArrowLeft, Search, RefreshCw, Plus } from "lucide-react";
import { searchMedia, MediaLookupResult } from "@/lib/media-lookup";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { CoverSearchDialog } from "@/components/CoverSearchDialog";
import { FormatEditor } from "@/components/FormatEditor";
import { PhysicalMediaDetails } from "@/components/PhysicalMediaDetails";
import { CollectionEditor } from "@/components/CollectionEditor";
import { GenerateCoverArtButton } from "@/components/GenerateCoverArtButton";

interface DetailDrawerProps {
  item: MediaItem | null;
  open: boolean;
  onClose: () => void;
  onDuplicated?: () => void;
  /** Full sorted list for prev/next navigation */
  itemList?: MediaItem[];
  onNavigate?: (item: MediaItem) => void;
}

export function DetailDrawer({ item, open, onClose, onDuplicated, itemList, onNavigate }: DetailDrawerProps) {
  const [coverSearchOpen, setCoverSearchOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingYear, setEditingYear] = useState(false);
  const [yearDraft, setYearDraft] = useState("");
  const [editingSortTitle, setEditingSortTitle] = useState(false);
  const [sortTitleDraft, setSortTitleDraft] = useState("");
  const [editingTags, setEditingTags] = useState(false);
  const [tagsDraft, setTagsDraft] = useState("");
  const [localFlags, setLocalFlags] = useState<Record<string, boolean>>({});
  const [localFormats, setLocalFormats] = useState<string[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const yearInputRef = useRef<HTMLInputElement>(null);
  const updateItem = useUpdateItem();
  const duplicateItem = useDuplicateItem();
  const deleteItem = useDeleteItem();

  // Reset local overrides when item changes
  useEffect(() => {
    setLocalFlags({});
    setLocalFormats(null);
    setEditingTags(false);
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

  // Prev/Next navigation
  const currentIndex = itemList?.findIndex((i) => i.id === item.id) ?? -1;
  const prevItem = currentIndex > 0 ? itemList![currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < (itemList?.length ?? 0) - 1 ? itemList![currentIndex + 1] : null;

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

          {/* Navigation bar */}
          <div className="flex items-center justify-between py-2 border-b border-border mb-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="gap-1 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={!prevItem}
                onClick={() => prevItem && onNavigate?.(prevItem)}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!nextItem}
                onClick={() => nextItem && onNavigate?.(nextItem)}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-6">
            {/* Poster */}
            <div className="relative aspect-[2/3] w-full max-w-[280px] mx-auto rounded-md overflow-hidden">
              {item.posterUrl ? (
                <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-secondary flex flex-col items-center justify-center gap-3">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No cover art</p>
                  <GenerateCoverArtButton
                    title={item.title}
                    artist={item.metadata?.artist || item.artist}
                    genre={item.genre}
                    onGenerated={(url) => {
                      updateItem.mutate({
                        id: item.id,
                        poster_url: url,
                      } as any);
                    }}
                  />
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

            {/* Physical Media Details */}
            <PhysicalMediaDetails item={item} />

            {/* Collection / Box Set */}
            <CollectionEditor item={item} />

            {/* TMDB Metadata (genre, runtime, tagline) */}
            <TmdbMetadata item={item} />

            {/* Tags */}
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tags
              </p>
              {editingTags ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={tagsDraft}
                    onChange={(e) => setTagsDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const tags = tagsDraft.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
                        const currentMeta = (item as any).metadata || {};
                        updateItem.mutateAsync({ id: item.id, metadata: { ...currentMeta, tags } } as any)
                          .then(() => toast({ title: "Tags saved!" }))
                          .catch(() => toast({ title: "Update failed", variant: "destructive" }));
                        setEditingTags(false);
                      }
                      if (e.key === "Escape") setEditingTags(false);
                    }}
                    className="h-8 text-sm"
                    placeholder="#marvel, #pixar, #romcom"
                    autoFocus
                  />
                  <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={() => {
                    const tags = tagsDraft.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
                    const currentMeta = (item as any).metadata || {};
                    updateItem.mutateAsync({ id: item.id, metadata: { ...currentMeta, tags } } as any)
                      .then(() => toast({ title: "Tags saved!" }))
                      .catch(() => toast({ title: "Update failed", variant: "destructive" }));
                    setEditingTags(false);
                  }}>
                    <Check className="w-4 h-4 text-success" />
                  </Button>
                  <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={() => setEditingTags(false)}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-wrap group/tags">
                  {((item.metadata as any)?.tags as string[] || []).length > 0 ? (
                    <>
                      {((item.metadata as any).tags as string[]).map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">#{tag}</Badge>
                      ))}
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">No tags</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover/tags:opacity-100 transition-opacity h-6 w-6"
                    onClick={() => {
                      const existingTags = ((item.metadata as any)?.tags as string[]) || [];
                      setTagsDraft(existingTags.map(t => `#${t}`).join(", "));
                      setEditingTags(true);
                    }}
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>

            {/* Barcode — read from physical_product if available */}
            <BarcodeSection item={item} />

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

            {/* Copies — driven by media_copies count */}
            <CopiesCounter itemId={item.id} />

            {/* Add Edition */}
            <AddEditionButton item={item} formats={formats} onDuplicated={onDuplicated} />

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

            {/* Delete */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Item
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{item.title}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove this item from your collection. If you're merging duplicates, make sure you've already increased the copy count on the item you're keeping.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      try {
                        await deleteItem.mutateAsync(item.id);
                        toast({ title: "Item deleted", description: item.title });
                        onClose();
                      } catch {
                        toast({ title: "Delete failed", variant: "destructive" });
                      }
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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

function AddEditionButton({ item, formats, onDuplicated }: { item: MediaItem; formats: string[]; onDuplicated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [editionName, setEditionName] = useState("");
  const duplicateItem = useDuplicateItem();

  const handleAddEdition = async () => {
    const trimmed = editionName.trim();
    if (!trimmed) return;
    try {
      const dbItem: any = {
        title: item.title,
        year: item.year ?? null,
        format: item.format ?? null,
        formats: formats,
        poster_url: item.posterUrl ?? null,
        genre: item.genre ?? null,
        rating: item.rating ?? null,
        notes: null,
        in_plex: false,
        digital_copy: false,
        wishlist: false,
        want_to_watch: false,
        last_watched: null,
        watch_notes: null,
        media_type: item.mediaType ?? "movies",
        barcode: null,
        sort_title: item.sortTitle ?? null,
        metadata: { edition: trimmed },
      };
      await duplicateItem.mutateAsync(dbItem);
      toast({ title: "Edition added!", description: `${item.title} — ${trimmed}` });
      onDuplicated?.();
      setOpen(false);
      setEditionName("");
    } catch {
      toast({ title: "Failed to add edition", variant: "destructive" });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="w-full border-primary/30 text-primary hover:bg-primary/10">
          <Plus className="w-4 h-4 mr-2" />
          Add Different Edition
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Add Edition of "{item.title}"</AlertDialogTitle>
          <AlertDialogDescription>
            Enter the edition name (e.g., "Steelbook", "3 Disc Deluxe Edition", "4K/Blu-ray/Digital"). 
            This creates a new entry with the same title but different edition info.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={editionName}
          onChange={(e) => setEditionName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddEdition()}
          placeholder="e.g. Steelbook, 3 Disc Deluxe, 4K/Blu-ray Combo"
          autoFocus
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleAddEdition} disabled={!editionName.trim() || duplicateItem.isPending}>
            {duplicateItem.isPending ? "Adding..." : "Add Edition"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BarcodeSection({ item }: { item: MediaItem }) {
  const { data: physicalProducts } = usePhysicalProductsForItem(item.id);
  const updateItem = useUpdateItem();
  const [editingBarcode, setEditingBarcode] = useState(false);
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const barcodeScannerRef = useRef<HTMLDivElement>(null);
  const barcodeQrRef = useRef<any>(null);

  // Get barcodes from physical products
  const ppBarcodes = (physicalProducts || [])
    .filter((pp: any) => pp.barcode)
    .map((pp: any) => ({ barcode: pp.barcode, title: pp.product_title }));
  
  const displayBarcode = ppBarcodes.length > 0 ? ppBarcodes[0].barcode : item.barcode;

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
        <Barcode className="w-3 h-3" /> UPC / Barcode
      </p>
      {ppBarcodes.length > 1 ? (
        <div className="space-y-1">
          {ppBarcodes.map((pb: any, i: number) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-sm font-mono text-foreground">{pb.barcode}</span>
              <span className="text-[10px] text-muted-foreground">({pb.title})</span>
            </div>
          ))}
        </div>
      ) : editingBarcode ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={barcodeDraft}
              onChange={(e) => setBarcodeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const trimmed = barcodeDraft.trim();
                  updateItem.mutateAsync({ id: item.id, barcode: trimmed || null } as any)
                    .then(() => toast({ title: trimmed ? "Barcode saved!" : "Barcode removed" }))
                    .catch(() => toast({ title: "Update failed", variant: "destructive" }));
                  setEditingBarcode(false);
                }
                if (e.key === "Escape") setEditingBarcode(false);
              }}
              className="h-8 text-sm font-mono"
              placeholder="Enter UPC/barcode…"
              autoFocus
            />
            <Button variant="outline" size="icon" className="shrink-0 h-8 w-8" onClick={async () => {
              setScanningBarcode(true);
              const { Html5Qrcode } = await import("html5-qrcode");
              await new Promise((r) => setTimeout(r, 100));
              const scanner = new Html5Qrcode("detail-barcode-scanner");
              barcodeQrRef.current = scanner;
              try {
                await scanner.start(
                  { facingMode: "environment" },
                  { fps: 10, qrbox: { width: 250, height: 100 } },
                  async (decoded: string) => {
                    setBarcodeDraft(decoded);
                    try { await scanner.stop(); scanner.clear(); } catch {}
                    barcodeQrRef.current = null;
                    setScanningBarcode(false);
                  },
                  () => {}
                );
              } catch (err: any) {
                toast({ title: "Camera error", description: err.message, variant: "destructive" });
                setScanningBarcode(false);
              }
            }}>
              <Camera className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={() => {
              const trimmed = barcodeDraft.trim();
              updateItem.mutateAsync({ id: item.id, barcode: trimmed || null } as any)
                .then(() => toast({ title: trimmed ? "Barcode saved!" : "Barcode removed" }))
                .catch(() => toast({ title: "Update failed", variant: "destructive" }));
              setEditingBarcode(false);
            }}>
              <Check className="w-4 h-4 text-success" />
            </Button>
            <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" onClick={() => {
              if (barcodeQrRef.current) {
                try { barcodeQrRef.current.stop(); barcodeQrRef.current.clear(); } catch {}
                barcodeQrRef.current = null;
              }
              setScanningBarcode(false);
              setEditingBarcode(false);
            }}>
              <X className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
          {scanningBarcode && (
            <div className="relative">
              <div id="detail-barcode-scanner" ref={barcodeScannerRef} className="w-full rounded-md overflow-hidden" />
              <Button size="sm" variant="destructive" className="absolute top-2 right-2" onClick={() => {
                if (barcodeQrRef.current) {
                  try { barcodeQrRef.current.stop(); barcodeQrRef.current.clear(); } catch {}
                  barcodeQrRef.current = null;
                }
                setScanningBarcode(false);
              }}>Stop</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1 group/barcode">
          <span
            className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors font-mono"
            onClick={() => { setBarcodeDraft(displayBarcode || ""); setEditingBarcode(true); }}
          >
            {displayBarcode || "Add barcode"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover/barcode:opacity-100 transition-opacity h-6 w-6"
            onClick={() => { setBarcodeDraft(displayBarcode || ""); setEditingBarcode(true); }}
          >
            <Pencil className="w-3 h-3 text-muted-foreground" />
          </Button>
        </div>
      )}
    </div>
  );
}

function CopiesCounter({ itemId }: { itemId: string }) {
  const { data: physicalProducts } = usePhysicalProductsForItem(itemId);
  const count = physicalProducts?.length ?? 0;

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
        <Layers className="w-3 h-3" /> Copies Owned
      </p>
      <span className="text-sm font-medium text-foreground">{count || "—"}</span>
      {count === 0 && (
        <p className="text-[10px] text-muted-foreground">No physical products linked yet</p>
      )}
    </div>
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


function FetchDetailsButton({ item }: { item: MediaItem }) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MediaLookupResult[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const updateItem = useUpdateItem();
  const mediaType = (item.mediaType || "movies") as MediaTab;

  const handleFetch = async () => {
    setLoading(true);
    try {
      const res = await searchMedia(mediaType, item.title, { year: item.year ?? undefined });
      if (!res.length) {
        toast({ title: "No results found", description: "Try editing the title first, then fetch again.", variant: "destructive" });
        setLoading(false);
        return;
      }
      setResults(res.slice(0, 5));
      setSelectedIdx(0);
      setPreviewOpen(true);
    } catch (e: any) {
      toast({ title: "Lookup failed", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const handleAccept = async () => {
    const best = results[selectedIdx];
    if (!best) return;
    setLoading(true);
    try {
      const currentMeta = (item as any).metadata || {};
      const newMeta: Record<string, any> = { ...currentMeta };
      if (best.overview) newMeta.overview = best.overview;
      if (best.runtime) newMeta.runtime = best.runtime;
      if (best.tagline) newMeta.tagline = best.tagline;
      if (best.cast?.length) newMeta.cast = best.cast;
      if (best.crew) newMeta.crew = best.crew;
      if (best.artist) newMeta.artist = best.artist;
      if (best.label) newMeta.label = best.label;
      if (best.tracklist?.length) newMeta.tracklist = best.tracklist;
      if (best.author) newMeta.author = best.author;
      if (best.page_count) newMeta.page_count = best.page_count;
      if (best.publisher) newMeta.publisher = best.publisher;
      if (best.isbn) newMeta.isbn = best.isbn;
      if (best.description) newMeta.overview = best.description;
      if (best.platforms?.length) newMeta.platforms = best.platforms;
      if (best.developer) newMeta.developer = best.developer;

      const updates: any = { id: item.id, metadata: newMeta };
      // Always overwrite with the selected match's data
      if (best.title) updates.title = best.title;
      if (best.genre) updates.genre = best.genre;
      if (best.rating) updates.rating = best.rating;
      if (best.cover_url) updates.poster_url = best.cover_url;
      if (best.year) updates.year = best.year;
      if (best.tmdb_id) updates.external_id = String(best.tmdb_id);

      await updateItem.mutateAsync(updates);
      toast({ title: "Details updated!", description: `Applied metadata from "${best.title}"` });
    } catch (e: any) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    }
    setLoading(false);
    setPreviewOpen(false);
  };

  const selected = results[selectedIdx];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleFetch}
        disabled={loading}
        className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
        {loading ? "Searching..." : "Fetch Details"}
      </Button>

      <AlertDialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <AlertDialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Select the correct match</AlertDialogTitle>
            <AlertDialogDescription>
              Choose a result below and tap "Apply" to update this item's details.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {results.length > 1 && (
            <div className="flex gap-1.5 flex-wrap">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
                    i === selectedIdx
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary/50 text-muted-foreground border-border hover:bg-secondary"
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="space-y-3 py-2">
              <div className="flex gap-3">
                {selected.cover_url && (
                  <img src={selected.cover_url} alt={selected.title} className="w-16 h-24 rounded object-cover shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{selected.title}</p>
                  {selected.year && <p className="text-xs text-muted-foreground">{selected.year}</p>}
                  {selected.genre && <p className="text-xs text-muted-foreground">{selected.genre}</p>}
                  {(selected as any).artist && <p className="text-xs text-muted-foreground">{(selected as any).artist}</p>}
                  {(selected as any).author && <p className="text-xs text-muted-foreground">{(selected as any).author}</p>}
                </div>
              </div>
              {(selected.overview || (selected as any).description) && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
                  {selected.overview || (selected as any).description}
                </p>
              )}
              {selected.cast && selected.cast.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Cast:</span> {selected.cast.slice(0, 4).map(c => c.name).join(", ")}
                </p>
              )}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleAccept} disabled={loading}>
              {loading ? "Applying..." : "Apply"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TmdbMetadata({ item }: { item: MediaItem }) {
  const meta = (item as any).metadata || {};
  const runtime = meta.runtime as number | undefined;
  const tagline = meta.tagline as string | undefined;
  const genre = item.genre;
  const cast = meta.cast as { name: string; character: string; profile_url: string | null }[] | undefined;
  const crew = meta.crew as { director?: string[]; writer?: string[]; producer?: string[] } | undefined;
  const overview = meta.overview as string | undefined;

  // Music-specific
  const artist = meta.artist as string | undefined;
  const label = meta.label as string | undefined;
  const tracklist = meta.tracklist as { position: string; title: string; duration?: string }[] | undefined;

  // Book-specific
  const author = meta.author as string | undefined;
  const pageCount = meta.page_count as number | undefined;
  const publisher = meta.publisher as string | undefined;
  const isbn = meta.isbn as string | undefined;

  // Game-specific
  const platforms = meta.platforms as string[] | undefined;
  const developer = meta.developer as string | undefined;

  const hasAny = genre || runtime || tagline || cast?.length || crew || overview
    || artist || label || tracklist?.length || author || pageCount || publisher
    || platforms?.length || developer;

  if (!hasAny) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Details</p>
        <p className="text-sm text-muted-foreground">No metadata yet</p>
        <FetchDetailsButton item={item} />
      </div>
    );
  }

  const formatRuntime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="space-y-3">
      {/* Artist / Author */}
      {(artist || author) && (
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {author ? "Author" : "Artist"}
          </p>
          <p className="text-sm text-foreground">{author || artist}</p>
        </div>
      )}

      {genre && (
        <div className="flex items-center gap-2 flex-wrap">
          {genre.split(",").map((g) => (
            <Badge key={g.trim()} variant="outline" className="text-[10px]">{g.trim()}</Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
        {runtime && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {formatRuntime(runtime)}
          </span>
        )}
        {pageCount && <span>{pageCount} pages</span>}
        {publisher && <span>Published by {publisher}</span>}
        {label && <span>Label: {label}</span>}
        {developer && <span>Developer: {developer}</span>}
        {isbn && <span className="font-mono text-xs">ISBN: {isbn}</span>}
      </div>

      {/* Platforms (games) */}
      {platforms && platforms.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {platforms.map((p) => (
            <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
          ))}
        </div>
      )}

      {tagline && (
        <p className="text-xs text-muted-foreground italic">"{tagline}"</p>
      )}
      {overview && (
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{overview}</p>
      )}

      {/* Tracklist (music) */}
      {tracklist && tracklist.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Tracklist</p>
          <div className="text-xs max-h-32 overflow-y-auto space-y-0.5">
            {tracklist.map((t, i) => (
              <div key={i} className="flex items-center justify-between text-muted-foreground">
                <span><span className="text-foreground">{t.position || i + 1}.</span> {t.title}</span>
                {t.duration && <span className="tabular-nums">{t.duration}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cast */}
      {cast && cast.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Cast</p>
          <div className="grid grid-cols-1 gap-1">
            {cast.slice(0, 6).map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {c.profile_url ? (
                  <img src={c.profile_url} alt={c.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-secondary shrink-0" />
                )}
                <span className="text-foreground font-medium truncate">{c.name}</span>
                {c.character && <span className="text-muted-foreground truncate">as {c.character}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Crew */}
      {crew && (crew.director?.length || crew.writer?.length || crew.producer?.length) ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Crew</p>
          <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
            {crew.director && crew.director.length > 0 && (
              <>
                <span className="text-muted-foreground font-medium">Director</span>
                <span className="text-foreground">{crew.director.join(", ")}</span>
              </>
            )}
            {crew.writer && crew.writer.length > 0 && (
              <>
                <span className="text-muted-foreground font-medium">Writer</span>
                <span className="text-foreground">{crew.writer.join(", ")}</span>
              </>
            )}
            {crew.producer && crew.producer.length > 0 && (
              <>
                <span className="text-muted-foreground font-medium">Producer</span>
                <span className="text-foreground">{crew.producer.join(", ")}</span>
              </>
            )}
          </div>
        </div>
      ) : null}

      {/* Re-fetch details */}
      <FetchDetailsButton item={item} />
    </div>
  );
}
