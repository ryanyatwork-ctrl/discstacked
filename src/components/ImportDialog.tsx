import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import { useImportItems } from "@/hooks/useMediaItems";
import { MediaTab } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { TAB_LABELS, mapClzRow, mergeDuplicates, expandBoxSets, parseCsv } from "@/lib/import-utils";

interface ImportDialogProps {
  activeTab: MediaTab;
}

export function ImportDialog({ activeTab }: ImportDialogProps) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportItems();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let rawItems: Record<string, string>[];
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith(".json")) {
        const parsed = JSON.parse(text);
        rawItems = Array.isArray(parsed) ? parsed : [parsed];
      } else if (fileName.endsWith(".csv") || fileName.endsWith(".txt")) {
        rawItems = parseCsv(text);
      } else {
        toast({ title: "Invalid file", description: "Please upload a .csv, .txt, or .json file.", variant: "destructive" });
        return;
      }

      if (rawItems.length === 0) {
        toast({ title: "Empty file", description: "No items found in the file.", variant: "destructive" });
        return;
      }

      const items = rawItems.map(row => mapClzRow(row, activeTab));

      // For CD imports, promote artist/label from metadata to top-level metadata fields
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

      // For Games imports, promote platform/developer/publisher into metadata
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

      // Games: skip merging (each platform copy is unique) and box set expansion
      const merged = activeTab === "games" ? items : mergeDuplicates(items);
      const expanded = (activeTab === "cds" || activeTab === "games") ? merged : expandBoxSets(merged);

      // Strip internal fields that shouldn't be sent to the database
      for (const item of expanded) {
        delete item._rowFormats;
        delete item._quantity;
        delete item._artist;
        delete item._gamePlatform;
      }

      toast({ title: "Importing…", description: `Processing ${expanded.length} items…` });

      await importMutation.mutateAsync({
        items: expanded,
        mediaType: activeTab,
        replace: true,
      });

      toast({ title: "Import complete", description: `${expanded.length} items imported (${items.length} rows processed) to ${TAB_LABELS[activeTab]}.` });
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }

    if (fileRef.current) fileRef.current.value = "";
  };

  const isCds = activeTab === "cds";
  const isMovies = activeTab === "movies" || activeTab === "music-films";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Upload className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Import to {TAB_LABELS[activeTab]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Upload a <strong>.csv</strong>, <strong>.txt</strong>, or <strong>.json</strong> file. This will <strong>replace</strong> all existing items in {TAB_LABELS[activeTab]}.
          </p>
          <p className="text-xs text-muted-foreground">
            {isCds ? (
              <>Supports <code className="text-accent">CLZ Music Collector</code> exports (Artist, Title, Release Year, Format, Tracks, Length, Genre, Label) and standard CSV files.</>
            ) : activeTab === "games" ? (
              <>Supports <code className="text-accent">CLZ Game Collector</code> exports (Title, Platform, Genre, Developer, Publisher) and standard CSV files. You can also import from VideoGameGeek in Settings.</>
            ) : (
              <>Supports <code className="text-accent">CLZ</code> exports and standard CSV-style text files. Box sets and multi-movie titles are automatically detected and expanded.</>
            )}
          </p>
          {isMovies && (
            <div className="rounded-md border border-border/60 bg-secondary/20 p-3 space-y-2 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Recommended CLZ export settings</p>
              <p>Use <strong>Text...</strong> export in CLZ. Keep <strong>Include Field Names on First Row</strong> on, choose <strong>Comma (,)</strong> delimiter, <strong>Double Quote</strong> text qualifier, and <strong>UTF8</strong> encoding.</p>
              <p>With CLZ's default movie fields from your screenshot, DiscStacked maps:</p>
              <p><code>Title</code> → title, <code>Movie Release Year</code> → year, <code>Running Time</code> → runtime metadata, <code>Genre</code> → genre, <code>Director</code> → crew metadata.</p>
              <p>If you add more CLZ fields later, DiscStacked also understands <code>Format</code>, <code>Edition</code>, <code>Barcode</code>, <code>No. of Discs/Tapes</code>, <code>Rating</code>, and <code>Notes</code>.</p>
              <div className="pt-2 border-t border-border/50 space-y-1">
                <p className="font-medium text-foreground">Blu-ray.com exports</p>
                <p>DiscStacked also accepts Blu-ray.com collection exports as <strong>.csv</strong> or <strong>.txt</strong>. Comma-delimited and tab-delimited text exports are both supported.</p>
                <p>For best results, include columns like <code>Title</code>, <code>Release</code>, <code>Year</code>/<code>Released</code>, <code>Format</code>/<code>Media</code>, <code>Barcode</code>/<code>UPC/EAN</code>, <code>Edition</code>/<code>Version</code>, and <code>Discs</code>.</p>
              </div>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,.json"
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
      </DialogContent>
    </Dialog>
  );
}
