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

      if (file.name.endsWith(".json")) {
        const parsed = JSON.parse(text);
        rawItems = Array.isArray(parsed) ? parsed : [parsed];
      } else if (file.name.endsWith(".csv")) {
        rawItems = parseCsv(text);
      } else {
        toast({ title: "Invalid file", description: "Please upload a .csv or .json file.", variant: "destructive" });
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
            Upload a <strong>.csv</strong> or <strong>.json</strong> file. This will <strong>replace</strong> all existing items in {TAB_LABELS[activeTab]}.
          </p>
          <p className="text-xs text-muted-foreground">
            {isCds ? (
              <>Supports <code className="text-accent">CLZ Music Collector</code> exports (Artist, Title, Release Year, Format, Tracks, Length, Genre, Label) and standard CSV files.</>
            ) : activeTab === "games" ? (
              <>Supports <code className="text-accent">CLZ Game Collector</code> exports (Title, Platform, Genre, Developer, Publisher) and standard CSV files. You can also import from VideoGameGeek in Settings.</>
            ) : (
              <>Supports <code className="text-accent">CLZ</code> exports and standard CSV files. Box sets and multi-movie titles are automatically detected and expanded.</>
            )}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.json"
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
