import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScanBarcode, Camera, Loader2, Check, X, Trash2, Plus, AlertTriangle, Copy, Keyboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab, FORMATS } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { lookupBarcode as unifiedLookupBarcode, MediaLookupResult } from "@/lib/media-lookup";

interface ScanQueueItem {
  barcode: string;
  status: "looking" | "found" | "not_found" | "error";
  title?: string;
  year?: number | null;
  genre?: string | null;
  posterUrl?: string | null;
  runtime?: number | null;
  tagline?: string | null;
  artist?: string | null;
  author?: string | null;
  format: string;
  selected: boolean;
  alreadyOwned?: boolean;
  existingTitle?: string;
  extraMeta?: Record<string, any>;
}

interface BulkScanDialogProps {
  activeTab: MediaTab;
}

const TAB_LABELS: Record<MediaTab, string> = {
  movies: "Bulk Barcode Scan",
  "music-films": "Bulk Barcode Scan",
  cds: "Bulk Barcode Scan — Music",
  games: "Bulk Scan — Games",
};

export function BulkScanDialog({ activeTab }: BulkScanDialogProps) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<ScanQueueItem[]>([]);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultFormat, setDefaultFormat] = useState(FORMATS[activeTab]?.[0] || "");
  const [manualBarcode, setManualBarcode] = useState("");
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const processedBarcodesRef = useRef(new Set<string>());
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Reset default format when tab changes
  useEffect(() => {
    setDefaultFormat(FORMATS[activeTab]?.[0] || "");
  }, [activeTab]);

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch {}
      html5QrCodeRef.current = null;
    }
    setScanning(false);
  };

  const doLookup = async (barcode: string) => {
    try {
      const result = await unifiedLookupBarcode(activeTab, barcode);
      if (result.direct) {
        return {
          status: "found" as const,
          title: result.direct.title,
          year: result.direct.year,
          genre: result.direct.genre,
          posterUrl: result.direct.cover_url,
          runtime: result.direct.runtime,
          tagline: result.direct.tagline,
          artist: result.direct.artist,
          author: result.direct.author,
          extraMeta: {
            ...(result.direct.overview ? { overview: result.direct.overview } : {}),
            ...(result.direct.cast ? { cast: result.direct.cast } : {}),
            ...(result.direct.crew ? { crew: result.direct.crew } : {}),
            ...(result.direct.label ? { label: result.direct.label } : {}),
            ...(result.direct.tracklist ? { tracklist: result.direct.tracklist } : {}),
            ...(result.direct.page_count ? { page_count: result.direct.page_count } : {}),
            ...(result.direct.publisher ? { publisher: result.direct.publisher } : {}),
            ...(result.direct.isbn ? { isbn: result.direct.isbn } : {}),
            ...(result.direct.platforms ? { platforms: result.direct.platforms } : {}),
            ...(result.direct.developer ? { developer: result.direct.developer } : {}),
            ...(result.direct.source ? { source: result.direct.source } : {}),
          },
        };
      }
      if (result.results && result.results.length > 0) {
        const top = result.results[0];
        return {
          status: "found" as const,
          title: top.title,
          year: top.year,
          genre: top.genre,
          posterUrl: top.cover_url,
          runtime: top.runtime,
          tagline: top.tagline,
          artist: top.artist,
          author: top.author,
          extraMeta: {},
        };
      }
      return { status: "not_found" as const };
    } catch {
      return { status: "error" as const };
    }
  };

  const startScanner = async () => {
    setScanning(true);
    processedBarcodesRef.current = new Set(queue.map((q) => q.barcode));
    const { Html5Qrcode } = await import("html5-qrcode");
    await new Promise((r) => setTimeout(r, 100));

    const scanner = new Html5Qrcode("bulk-barcode-scanner");
    html5QrCodeRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 120 } },
        async (decoded: string) => {
          if (processedBarcodesRef.current.has(decoded)) return;
          processedBarcodesRef.current.add(decoded);

          // Add to queue immediately as "looking"
          const newItem: ScanQueueItem = {
            barcode: decoded,
            status: "looking",
            format: defaultFormat,
            selected: true,
          };
          setQueue((prev) => [newItem, ...prev]);

          // Play a subtle beep via AudioContext
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 1200;
            gain.gain.value = 0.1;
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
          } catch {}

          // Check if already in collection
          let alreadyOwned = false;
          let existingTitle: string | undefined;
          if (user) {
            const { data: existing } = await supabase
              .from("media_items")
              .select("title")
              .eq("user_id", user.id)
              .eq("barcode", decoded)
              .limit(1);
            if (existing && existing.length > 0) {
              alreadyOwned = true;
              existingTitle = existing[0].title;
              // Play a different warning tone
              try {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 400;
                gain.gain.value = 0.15;
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
              } catch {}
            }
          }

          // Lookup in background using unified lookup
          const result = await doLookup(decoded);
          setQueue((prev) =>
            prev.map((item) =>
              item.barcode === decoded
                ? {
                    ...item,
                    ...result,
                    alreadyOwned,
                    existingTitle: existingTitle || result.title,
                    selected: !alreadyOwned, // deselect by default if already owned
                  }
                : item
            )
          );
        },
        () => {}
      );
    } catch (err: any) {
      toast({ title: "Camera error", description: err.message || "Could not access camera", variant: "destructive" });
      setScanning(false);
    }
  };

  const toggleItem = (barcode: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.barcode === barcode ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const removeItem = (barcode: string) => {
    setQueue((prev) => prev.filter((item) => item.barcode !== barcode));
    processedBarcodesRef.current.delete(barcode);
  };

  const updateItemFormat = (barcode: string, format: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.barcode === barcode ? { ...item, format } : item
      )
    );
  };

  // Manual barcode entry
  const handleManualAdd = async () => {
    const code = manualBarcode.trim();
    if (!code || processedBarcodesRef.current.has(code)) return;
    processedBarcodesRef.current.add(code);
    setManualBarcode("");

    const newItem: ScanQueueItem = {
      barcode: code,
      status: "looking",
      format: defaultFormat,
      selected: true,
    };
    setQueue((prev) => [newItem, ...prev]);

    // Check existing
    let alreadyOwned = false;
    let existingTitle: string | undefined;
    if (user) {
      const { data: existing } = await supabase
        .from("media_items").select("title")
        .eq("user_id", user.id).eq("barcode", code).limit(1);
      if (existing && existing.length > 0) {
        alreadyOwned = true;
        existingTitle = existing[0].title;
      }
    }

    const result = await doLookup(code);
    setQueue((prev) =>
      prev.map((item) =>
        item.barcode === code
          ? { ...item, ...result, alreadyOwned, existingTitle: existingTitle || result.title, selected: !alreadyOwned }
          : item
      )
    );
  };

  const handleCommit = async () => {
    const selected = queue.filter((item) => item.selected && item.status === "found" && item.title);
    if (selected.length === 0 || !user) return;
    setSaving(true);
    try {
      const rows = selected.map((item) => ({
        user_id: user.id,
        title: item.title!,
        year: item.year ?? null,
        format: item.format || null,
        formats: item.format ? [item.format] : [],
        genre: item.genre ?? null,
        poster_url: item.posterUrl ?? null,
        barcode: item.barcode,
        media_type: activeTab,
        metadata: {
          ...(item.runtime ? { runtime: item.runtime } : {}),
          ...(item.tagline ? { tagline: item.tagline } : {}),
          ...(item.artist ? { artist: item.artist } : {}),
          ...(item.author ? { author: item.author } : {}),
          ...(item.extraMeta || {}),
        },
      }));

      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from("media_items").insert(chunk);
        if (error) throw error;
      }

      toast({ title: "Added!", description: `${selected.length} items added to your collection.` });
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
      setQueue([]);
      processedBarcodesRef.current.clear();
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  useEffect(() => {
    if (!open) {
      stopScanner();
      setQueue([]);
      processedBarcodesRef.current.clear();
    }
  }, [open]);

  const selectedCount = queue.filter((q) => q.selected && q.status === "found").length;
  const lookingCount = queue.filter((q) => q.status === "looking").length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Bulk Scan">
          <ScanBarcode className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">{TAB_LABELS[activeTab]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Default format */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Default format:</span>
            <Select value={defaultFormat} onValueChange={setDefaultFormat}>
              <SelectTrigger className="h-8 w-32 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(FORMATS[activeTab] || []).map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Scanner */}
          {scanning ? (
            <div className="relative">
              <div id="bulk-barcode-scanner" ref={scannerRef} className="w-full rounded-md overflow-hidden" />
              <Button size="sm" variant="destructive" className="absolute top-2 right-2" onClick={stopScanner}>
                Stop Scanner
              </Button>
              <p className="text-xs text-muted-foreground text-center mt-1">
                Keep scanning — each barcode is looked up automatically
              </p>
            </div>
          ) : (
            <Button variant="outline" className="w-full gap-2" onClick={startScanner}>
              <Camera className="h-4 w-4" />
              {queue.length > 0 ? "Resume Scanning" : "Start Scanning"}
            </Button>
          )}

          {/* Manual barcode/ISBN entry */}
          <div className="flex gap-2">
            <Input
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
              placeholder="Type barcode/UPC…"
              className="flex-1 h-8 text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleManualAdd()}
            />
            <Button variant="outline" size="sm" onClick={handleManualAdd} disabled={!manualBarcode.trim()} className="gap-1">
              <Keyboard className="h-3 h-3" /> Add
            </Button>
          </div>

          {/* Queue */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                Scanned: {queue.length} items
                {lookingCount > 0 && ` · ${lookingCount} looking up…`}
                {selectedCount > 0 && ` · ${selectedCount} selected`}
              </p>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {queue.map((item) => (
                  <div
                    key={item.barcode}
                    className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                      item.alreadyOwned && !item.selected
                        ? "border-warning/40 bg-warning/5"
                        : item.selected ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    {/* Poster thumbnail */}
                    <div className="w-10 h-14 rounded overflow-hidden shrink-0 bg-secondary">
                      {item.posterUrl ? (
                        <img src={item.posterUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {item.status === "looking" ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          ) : item.status === "not_found" ? (
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                          ) : (
                            <X className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {item.status === "looking" ? (
                        <p className="text-sm text-muted-foreground">Looking up {item.barcode}…</p>
                      ) : item.status === "found" ? (
                         <>
                           <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                           <p className="text-[10px] text-muted-foreground truncate">
                             {item.artist || item.author || ""}{(item.artist || item.author) && item.year ? " · " : ""}
                             {item.year}{item.genre ? ` · ${item.genre}` : ""}{item.runtime ? ` · ${Math.floor(item.runtime / 60)}h${item.runtime % 60}m` : ""}
                           </p>
                          {item.alreadyOwned && (
                            <p className="text-[10px] text-warning flex items-center gap-1 mt-0.5">
                              <Copy className="w-3 h-3" />
                              Already in collection{item.existingTitle ? ` as "${item.existingTitle}"` : ""}
                              {!item.selected && " — tap ✓ to add anyway"}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-destructive">
                          {item.status === "not_found" ? `No match: ${item.barcode}` : `Error: ${item.barcode}`}
                        </p>
                      )}
                    </div>

                    {/* Format selector */}
                    {item.status === "found" && (
                      <Select value={item.format} onValueChange={(v) => updateItemFormat(item.barcode, v)}>
                        <SelectTrigger className="h-7 w-20 text-[10px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(FORMATS[activeTab] || []).map((f) => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Select / remove */}
                    {item.status === "found" && (
                      <Button
                        variant={item.selected ? "default" : "outline"}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => toggleItem(item.barcode)}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeItem(item.barcode)}>
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commit */}
          {selectedCount > 0 && (
            <Button onClick={handleCommit} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add {selectedCount} Items to Collection
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
