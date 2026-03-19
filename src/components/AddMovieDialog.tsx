import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Camera, Loader2, Search } from "lucide-react";
import { useImportItems } from "@/hooks/useMediaItems";
import { searchTmdb, TmdbResult } from "@/lib/tmdb";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab, FORMATS } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface AddMovieDialogProps {
  activeTab: MediaTab;
}

export function AddMovieDialog({ activeTab }: AddMovieDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [format, setFormat] = useState("");
  const [barcode, setBarcode] = useState("");
  const [genre, setGenre] = useState("");
  const [notes, setNotes] = useState("");
  const [inPlex, setInPlex] = useState(false);
  const [digitalCopy, setDigitalCopy] = useState(false);
  const [wishlist, setWishlist] = useState(false);
  const [wantToWatch, setWantToWatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [tmdbResults, setTmdbResults] = useState<TmdbResult[]>([]);
  const [selectedPoster, setSelectedPoster] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const resetForm = () => {
    setTitle("");
    setYear("");
    setFormat("");
    setBarcode("");
    setGenre("");
    setNotes("");
    setInPlex(false);
    setDigitalCopy(false);
    setWishlist(false);
    setWantToWatch(false);
    setTmdbResults([]);
    setSelectedPoster(null);
  };

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

  const startScanner = async () => {
    setScanning(true);
    // Dynamic import to avoid SSR issues
    const { Html5Qrcode } = await import("html5-qrcode");

    await new Promise((r) => setTimeout(r, 100)); // wait for DOM

    const scanner = new Html5Qrcode("barcode-scanner");
    html5QrCodeRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 100 } },
        async (decodedText: string) => {
          setBarcode(decodedText);
          await stopScanner();
          handleBarcodeLookup(decodedText);
        },
        () => {} // ignore scan failures
      );
    } catch (err: any) {
      toast({ title: "Camera error", description: err.message || "Could not access camera", variant: "destructive" });
      setScanning(false);
    }
  };

  const handleBarcodeLookup = async (upc: string) => {
    if (!upc.trim()) return;
    setLookingUp(true);
    try {
      // Use the edge function for UPC lookup
      const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
        body: { barcode: upc },
      });
      if (error) throw new Error(error.message);
      if (data?.title) {
        setTitle(data.title);
        if (data.year) setYear(String(data.year));
        if (data.genre) setGenre(data.genre);
        if (data.poster_url) setSelectedPoster(data.poster_url);
        toast({ title: "Found it!", description: data.title });
      } else if (data?.results?.length > 0) {
        setTmdbResults(data.results);
        toast({ title: "Multiple results found", description: "Select the correct one below." });
      } else {
        toast({ title: "Not found", description: "No match for that barcode. Try searching by title.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Lookup failed", variant: "destructive" });
    }
    setLookingUp(false);
  };

  const handleTmdbSearch = async () => {
    if (!title.trim()) return;
    setLookingUp(true);
    try {
      const yearNum = year ? parseInt(year) : undefined;
      const results = await searchTmdb(title, yearNum);
      setTmdbResults(results);
      if (results.length === 0) {
        toast({ title: "No results", description: "Try a different title." });
      }
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    }
    setLookingUp(false);
  };

  const selectTmdbResult = (result: TmdbResult) => {
    setTitle(result.title);
    if (result.year) setYear(String(result.year));
    if (result.genre) setGenre(result.genre);
    if (result.poster_url) setSelectedPoster(result.poster_url);
    setTmdbResults([]);
  };

  // Auto-set want_to_watch when no format is selected
  const effectiveWantToWatch = !format ? true : wantToWatch;

  const handleSave = async () => {
    if (!title.trim() || !user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("media_items").insert({
        user_id: user.id,
        title: title.trim(),
        year: year ? parseInt(year) : null,
        format: format || null,
        formats: format ? [format] : [],
        barcode: barcode || null,
        genre: genre || null,
        notes: notes || null,
        poster_url: selectedPoster || null,
        in_plex: inPlex,
        digital_copy: format === "Digital" ? true : digitalCopy,
        wishlist,
        want_to_watch: effectiveWantToWatch,
        media_type: activeTab,
      });
      if (error) throw error;
      toast({ title: "Added!", description: `${title} added to your collection.` });
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
      resetForm();
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  // Cleanup scanner on close
  useEffect(() => {
    if (!open) stopScanner();
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Barcode scanner */}
          <div className="space-y-2">
            <Label className="text-foreground">Barcode / UPC</Label>
            <div className="flex gap-2">
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Scan or type UPC…"
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleBarcodeLookup(barcode)}
              />
              <Button variant="outline" size="icon" onClick={startScanner} disabled={scanning}>
                <Camera className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => handleBarcodeLookup(barcode)} disabled={lookingUp || !barcode.trim()}>
                {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {scanning && (
              <div className="relative">
                <div id="barcode-scanner" ref={scannerRef} className="w-full rounded-md overflow-hidden" />
                <Button size="sm" variant="destructive" className="absolute top-2 right-2" onClick={stopScanner}>
                  Stop
                </Button>
              </div>
            )}
          </div>

          {/* Title + TMDB search */}
          <div className="space-y-2">
            <Label className="text-foreground">Title *</Label>
            <div className="flex gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Movie title…"
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleTmdbSearch()}
              />
              <Button variant="outline" size="icon" onClick={handleTmdbSearch} disabled={lookingUp || !title.trim()}>
                {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* TMDB results */}
          {tmdbResults.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {tmdbResults.slice(0, 8).map((r) => (
                <button
                  key={`${r.media_type}-${r.tmdb_id}`}
                  onClick={() => selectTmdbResult(r)}
                  className="relative rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                >
                  {r.poster_url ? (
                    <img src={r.poster_url} alt={r.title} className="w-full aspect-[2/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-secondary flex items-center justify-center">
                      <p className="text-[9px] text-muted-foreground p-1 text-center">{r.title}</p>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-background/90 p-1">
                    <p className="text-[9px] font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-[8px] text-muted-foreground">{r.year}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Selected poster preview */}
          {selectedPoster && (
            <div className="flex justify-center">
              <img src={selectedPoster} alt="Selected poster" className="h-32 rounded-md border border-border" />
            </div>
          )}

          {/* Year + Format */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-foreground">Year</Label>
              <Input
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2024"
                type="number"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Format</Label>
              <Select value={format || "none"} onValueChange={(v) => setFormat(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="None (watchlist only)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (watchlist only)</SelectItem>
                  {(FORMATS[activeTab] || []).map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!format && (
                <p className="text-[10px] text-muted-foreground">No format will auto-add to Want to Watch</p>
              )}
            </div>
          </div>

          {/* Genre */}
          <div className="space-y-2">
            <Label className="text-foreground">Genre</Label>
            <Input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="Action, Drama…" />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes…" rows={2} />
          </div>

          {/* Status toggles */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm">In Plex</Label>
              <Switch checked={inPlex} onCheckedChange={setInPlex} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm">Digital Copy</Label>
              <Switch checked={digitalCopy} onCheckedChange={setDigitalCopy} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm">Wishlist</Label>
              <Switch checked={wishlist} onCheckedChange={setWishlist} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm">Want to Watch</Label>
              <Switch checked={wantToWatch} onCheckedChange={setWantToWatch} />
            </div>
          </div>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving || !title.trim()} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {saving ? "Adding…" : "Add to Collection"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
