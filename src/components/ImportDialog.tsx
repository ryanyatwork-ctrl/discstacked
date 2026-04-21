import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, ArrowLeft, Trash2 } from "lucide-react";
import { useImportItems } from "@/hooks/useMediaItems";
import { MediaTab } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { TAB_LABELS, mapClzRow, mergeDuplicates, expandBoxSets, parseCsv } from "@/lib/import-utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface ImportDialogProps {
  activeTab: MediaTab;
}

export function ImportDialog({ activeTab }: ImportDialogProps) {
  const defaultReplaceExisting = activeTab === "games" || activeTab === "cds" ? false : true;
  const [open, setOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState<Record<string, any>[] | null>(null);
  const [rawRowCount, setRawRowCount] = useState(0);
  const [importFileName, setImportFileName] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(defaultReplaceExisting);
  const [previewSearch, setPreviewSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportItems();

  const resetPreview = () => {
    setPreviewItems(null);
    setRawRowCount(0);
    setImportFileName("");
    setPreviewSearch("");
    setReplaceExisting(defaultReplaceExisting);
  };

  const prepareImportItems = (rawItems: Record<string, string>[]) => {
    const items = rawItems.map(row => mapClzRow(row, activeTab));

    if (activeTab === "cds") {
      for (const item of items) {
        const meta = item.metadata || {};
        if (item._artist) {
          meta.artist = item._artist;
          delete item._artist;
        }
        if (meta.tracks) {
          meta.track_count = meta.tracks;
          delete meta.tracks;
        }
        if (meta.length) {
          meta.total_length = meta.length;
          delete meta.length;
        }
        item.metadata = meta;
      }
    }

    if (activeTab === "games") {
      for (const item of items) {
        const meta = item.metadata || {};
        if (meta.platform) {
          meta.platforms = [meta.platform];
          delete meta.platform;
        }
        item.metadata = meta;
      }
    }

    const merged = activeTab === "cds" ? items : mergeDuplicates(items, activeTab);
    const expanded = (activeTab === "cds" || activeTab === "games") ? merged : expandBoxSets(merged);

    return expanded.map((item, index) => {
      const next = { ...item, _previewId: `${index}-${item.barcode || item.title || "item"}` };
      delete next._rowFormats;
      delete next._quantity;
      delete next._artist;
      delete next._gamePlatform;
      return next;
    });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let rawItems: Record<string, string>[];
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        rawItems = Array.isArray(parsed) ? parsed : [parsed];
      } else if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
        const text = await file.text();
        rawItems = parseCsv(text);
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const firstSheet = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheet];
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        rawItems = parseCsv(csvText);
      } else {
        toast({ title: "Invalid file", description: "Please upload a .csv, .txt, .xlsx, or .json file.", variant: "destructive" });
        return;
      }

      if (rawItems.length === 0) {
        toast({ title: "Empty file", description: "No items found in the file.", variant: "destructive" });
        return;
      }

      const prepared = prepareImportItems(rawItems);
      setPreviewItems(prepared);
      setRawRowCount(rawItems.length);
      setImportFileName(file.name);
      toast({ title: "Import ready for review", description: `${prepared.length} items parsed from ${file.name}.` });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  const updatePreviewItem = (previewId: string, patch: Record<string, any>) => {
    setPreviewItems((prev) =>
      (prev || []).map((item) => {
        if (item._previewId !== previewId) return item;
        const next = { ...item, ...patch };
        if (patch.formats) {
          next.format = patch.formats[0] || null;
        }
        return next;
      }),
    );
  };

  const updateFormats = (previewId: string, rawValue: string) => {
    const formats = rawValue
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    updatePreviewItem(previewId, { formats, format: formats[0] || null });
  };

  const removePreviewItem = (previewId: string) => {
    setPreviewItems((prev) => (prev || []).filter((item) => item._previewId !== previewId));
  };

  const handleImport = async () => {
    if (!previewItems || previewItems.length === 0) return;

    try {
      toast({ title: "Importing…", description: `Saving ${previewItems.length} reviewed items…` });
      const cleaned = previewItems.map(({ _previewId, ...item }) => item);
      await importMutation.mutateAsync({
        items: cleaned,
        mediaType: activeTab,
        replace: replaceExisting,
      });

      toast({
        title: "Import complete",
        description: `${cleaned.length} items imported from ${importFileName || "your file"} into ${TAB_LABELS[activeTab]}.`,
      });
      resetPreview();
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }
  };

  const isCds = activeTab === "cds";
  const isMovies = activeTab === "movies" || activeTab === "music-films";
  const filteredPreviewItems = (previewItems || []).filter((item) => {
    if (!previewSearch.trim()) return true;
    const needle = previewSearch.toLowerCase();
    return [
      item.title,
      item.barcode,
      item.metadata?.artist,
      item.metadata?.catalog_number,
      item.metadata?.label,
      item.metadata?.edition,
      item.metadata?.edition?.package_title,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });
  const previewRows = filteredPreviewItems.slice(0, 75);
  const barcodeCount = (previewItems || []).filter((item) => item.barcode).length;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) resetPreview(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Upload className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Import to {TAB_LABELS[activeTab]}</DialogTitle>
        </DialogHeader>
        {!previewItems ? (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Upload a <strong>.csv</strong>, <strong>.txt</strong>, <strong>.xlsx</strong>, or <strong>.json</strong> file. You’ll get a review step before anything is imported.
            </p>
            <p className="text-xs text-muted-foreground">
              {isCds ? (
                <>Supports <code className="text-accent">CLZ Music Collector</code> exports and standard files. Catalog number, label, country, packaging, sleeve condition, and other edition fields are preserved for collector-grade imports.</>
              ) : activeTab === "games" ? (
                <>Supports <code className="text-accent">CLZ Game Collector</code> exports and standard files. When <code>Replace existing</code> is off, DiscStacked now merges CLZ games into matching VideoGameGeek items instead of blindly duplicating them.</>
              ) : (
                <>Supports <code className="text-accent">CLZ</code> and <code className="text-accent">Blu-ray.com</code> exports. Box sets and multi-movie titles are detected before import so you can review them.</>
              )}
            </p>
            {activeTab === "games" && (
              <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Recommended CLZ Game export settings</p>
                <p>Use <strong>Export to &gt; Text...</strong> in CLZ Game Collector with <strong>UTF8</strong>, <strong>Include Field Names on First Row</strong>, <strong>Comma (,)</strong> delimiter, <strong>Double Quote</strong> text qualifier, and <strong>Replace Line Breaks by Space</strong>.</p>
                <p><strong>Best fields:</strong> <code>Title</code>, <code>Platform</code>, <code>Genre</code>, <code>Release Year</code>, <code>Publisher</code>, <code>Developer</code>, plus <code>Barcode</code>, <code>Condition</code>, <code>Completed</code>, <code>Release Date</code>, <code>Language</code>, <code>Sound/Music</code>, <code>Multiplayer Support</code>, and <code>Links</code> when available.</p>
                <p>Imports match existing games by <code>barcode</code> first, then by <code>title + platform + year</code>, so CLZ can safely enrich your VGG imports when you leave <code>Replace existing</code> off.</p>
              </div>
            )}
            {isCds && (
              <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Recommended CLZ Music export settings</p>
                <p>Use <strong>Export to &gt; Text...</strong> in CLZ Music Collector with <strong>UTF8</strong>, <strong>Include Field Names on First Row</strong>, <strong>Comma (,)</strong> delimiter, <strong>Double Quote</strong> text qualifier, and <strong>Replace Line Breaks by Space</strong>.</p>
                <p><strong>Best fields:</strong> <code>Artist</code>, <code>Title</code>, <code>Release Year</code>, <code>Format</code>, <code>Tracks</code>, <code>Length</code>, <code>Genre</code>, <code>Label</code>, <code>Cat. Number</code>, <code>UPC (Barcode)</code>, <code>Discs</code>, <code>Subtitle</code>, <code>Country</code>, <code>Notes</code>, <code>Packaging</code>, <code>Package/Sleeve Condition</code>, and any cover/image references you keep in CLZ.</p>
                <p>Music imports do <strong>not</strong> silently merge duplicate-looking rows now. If CLZ has multiple copies or multiple variants, DiscStacked keeps them as separate owned items.</p>
              </div>
            )}
            {isMovies && (
              <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Recommended CLZ export settings</p>
                <p>Use <strong>Text...</strong> export in CLZ. Keep <strong>Include Field Names on First Row</strong> on, choose <strong>Comma (,)</strong> delimiter, <strong>Double Quote</strong> text qualifier, and <strong>UTF8</strong> encoding.</p>
                <p>DiscStacked now also accepts <strong>.xlsx</strong> workbook exports directly.</p>
                <p>If you add more CLZ fields later, DiscStacked understands <code>Format</code>, <code>Edition</code>, <code>Barcode</code>, <code>No. of Discs/Tapes</code>, <code>Rating</code>, and <code>Notes</code>.</p>
                <div className="pt-2 border-t border-border/50 space-y-1">
                  <p className="font-medium text-foreground">Blu-ray.com exports</p>
                  <p>Comma-delimited, tab-delimited, and workbook-style exports are supported. Best columns: <code>Title</code>, <code>Release</code>, <code>Year</code>/<code>Released</code>, <code>Format</code>/<code>Media</code>, <code>Barcode</code>/<code>UPC/EAN</code>, <code>Edition</code>/<code>Version</code>, and <code>Discs</code>.</p>
                </div>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls,.json"
              onChange={handleFile}
              className="hidden"
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={importMutation.isPending}
              className="w-full"
            >
              {importMutation.isPending ? "Importing..." : "Choose File"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">{importFileName}</p>
                <p className="text-xs text-muted-foreground">
                  {previewItems.length} import items from {rawRowCount} source rows · {barcodeCount} with barcodes
                </p>
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={resetPreview}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Choose Different File
              </Button>
            </div>

            <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-secondary/10 p-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <Label htmlFor="preview-search" className="text-xs text-muted-foreground">Search titles or barcodes</Label>
                <Input
                  id="preview-search"
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  placeholder="Filter preview..."
                  className="h-8 w-full md:w-72"
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="replace-existing" checked={replaceExisting} onCheckedChange={setReplaceExisting} />
                <Label htmlFor="replace-existing" className="text-sm text-foreground">
                  Replace existing {TAB_LABELS[activeTab]}
                </Label>
              </div>
            </div>

            <div className="rounded-md border border-border overflow-hidden">
              <div className="grid grid-cols-[minmax(220px,2fr)_90px_minmax(150px,1.2fr)_minmax(170px,1.3fr)_44px] gap-2 border-b border-border bg-secondary/20 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <span>Title</span>
                <span>Year</span>
                <span>Barcode</span>
                <span>Formats</span>
                <span />
              </div>
              <div className="max-h-[46vh] overflow-y-auto">
                {previewRows.map((item) => (
                  <div
                    key={item._previewId}
                    className="grid grid-cols-[minmax(220px,2fr)_90px_minmax(150px,1.2fr)_minmax(170px,1.3fr)_44px] gap-2 border-b border-border/60 px-3 py-2"
                  >
                    <Input
                      value={item.title || ""}
                      onChange={(e) => updatePreviewItem(item._previewId, { title: e.target.value })}
                      className="h-8"
                    />
                    <Input
                      value={item.year ?? ""}
                      onChange={(e) => updatePreviewItem(item._previewId, { year: e.target.value ? parseInt(e.target.value, 10) || null : null })}
                      className="h-8"
                      inputMode="numeric"
                    />
                    <Input
                      value={item.barcode || ""}
                      onChange={(e) => updatePreviewItem(item._previewId, { barcode: e.target.value })}
                      className="h-8 font-mono"
                    />
                    <Input
                      value={(item.formats || []).join(", ")}
                      onChange={(e) => updateFormats(item._previewId, e.target.value)}
                      className="h-8"
                      placeholder="Blu-ray, DVD, Digital"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => removePreviewItem(item._previewId)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {filteredPreviewItems.length > previewRows.length && (
              <p className="text-xs text-muted-foreground">
                Showing the first {previewRows.length} matching rows. Use search to edit a specific item before import.
              </p>
            )}

            <div className="flex justify-end">
              <Button onClick={handleImport} disabled={importMutation.isPending || previewItems.length === 0} className="min-w-44">
                {importMutation.isPending ? "Importing..." : `Import ${previewItems.length} Items`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
