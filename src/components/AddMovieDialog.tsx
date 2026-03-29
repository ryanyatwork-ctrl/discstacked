import { useState, useRef, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Plus, Camera, Loader2, Search, Check, Eye, Copy, Layers, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab, FORMATS } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { searchMedia, lookupBarcode, MediaLookupResult, MultiMovieResult } from "@/lib/media-lookup";
import { createPhysicalProductForItem, createMultiMovieProduct } from "@/hooks/usePhysicalProducts";

interface AddMovieDialogProps {
  activeTab: MediaTab;
}

// Tab-specific labels
const TAB_LABELS: Record<MediaTab, { title: string; searchPlaceholder: string; wantAction: string }> = {
  movies: { title: "Movie", searchPlaceholder: "Movie title…", wantAction: "Want to Watch" },
  "music-films": { title: "Music Film", searchPlaceholder: "Concert / music film…", wantAction: "Want to Watch" },
  cds: { title: "Album", searchPlaceholder: "Artist or album…", wantAction: "Want to Listen" },
  games: { title: "Game", searchPlaceholder: "Game title…", wantAction: "Want to Play" },
};

export function AddMovieDialog({ activeTab }: AddMovieDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [year, setYear] = useState("");
  const [format, setFormat] = useState("");
  const [formats, setFormats] = useState<string[]>([]);
  const [barcode, setBarcode] = useState("");
  const [genre, setGenre] = useState("");
  const [notes, setNotes] = useState("");
  const [artist, setArtist] = useState(""); // music / books author
  const [inPlex, setInPlex] = useState(false);
  const [digitalCopy, setDigitalCopy] = useState(false);
  const [wishlist, setWishlist] = useState(false);
  const [wantToWatch, setWantToWatch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [searchResults, setSearchResults] = useState<MediaLookupResult[]>([]);
  const [selectedPoster, setSelectedPoster] = useState<string | null>(null);
  const [extraMeta, setExtraMeta] = useState<Record<string, any>>({});
  const [multiSelect, setMultiSelect] = useState<MediaLookupResult[]>([]);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [ownershipWarning, setOwnershipWarning] = useState<{ type: "barcode" | "title"; existingTitle: string; existingFormats: string[] } | null>(null);
  const [multiMovieResult, setMultiMovieResult] = useState<MultiMovieResult | null>(null);
  const [multiMovieSaving, setMultiMovieSaving] = useState(false);
  const [multiMovieOwned, setMultiMovieOwned] = useState<Record<number, string[]>>({});
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const labels = TAB_LABELS[activeTab];

  const isMovieTab = activeTab === "movies" || activeTab === "music-films";
  const isMusicTab = activeTab === "cds";
  const isGameTab = activeTab === "games";
  const hasBarcode = isMovieTab || isMusicTab;

  const resetForm = () => {
    setTitle(""); setYear(""); setFormat(""); setFormats([]); setBarcode("");
    setGenre(""); setNotes(""); setArtist("");
    setInPlex(false); setDigitalCopy(false); setWishlist(false); setWantToWatch(false);
    setSearchResults([]); setSelectedPoster(null); setExtraMeta({});
    setMultiSelect([]); setMultiSelectMode(false); setOwnershipWarning(null);
    setMultiMovieResult(null); setMultiMovieSaving(false); setMultiMovieOwned({});
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try { await html5QrCodeRef.current.stop(); html5QrCodeRef.current.clear(); } catch {}
      html5QrCodeRef.current = null;
    }
    setScanning(false);
  };

  const startScanner = async () => {
    setScanning(true);
    const { Html5Qrcode } = await import("html5-qrcode");
    await new Promise((r) => setTimeout(r, 100));
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
        () => {}
      );
    } catch (err: any) {
      toast({ title: "Camera error", description: err.message || "Could not access camera", variant: "destructive" });
      setScanning(false);
    }
  };

  const checkOwnership = async (checkTitle?: string, checkBarcode?: string) => {
    if (!user) return;
    // Check by barcode first
    if (checkBarcode) {
      const { data: existing } = await supabase
        .from("media_items").select("title, formats")
        .eq("user_id", user.id).eq("barcode", checkBarcode.trim()).limit(1);
      if (existing && existing.length > 0) {
        setOwnershipWarning({
          type: "barcode",
          existingTitle: existing[0].title,
          existingFormats: existing[0].formats || [],
        });
        return;
      }
    }
    // Check by title (different edition)
    if (checkTitle) {
      const { data: titleMatch } = await supabase
        .from("media_items").select("title, formats")
        .eq("user_id", user.id).eq("media_type", activeTab)
        .ilike("title", checkTitle.trim()).limit(1);
      if (titleMatch && titleMatch.length > 0) {
        setOwnershipWarning({
          type: "title",
          existingTitle: titleMatch[0].title,
          existingFormats: titleMatch[0].formats || [],
        });
        return;
      }
    }
    setOwnershipWarning(null);
  };

  const handleBarcodeLookup = async (upc: string) => {
    if (!upc.trim()) return;
    setLookingUp(true);
    setMultiMovieResult(null);
    try {
      await checkOwnership(undefined, upc.trim());

      const result = await lookupBarcode(activeTab, upc);

      // Multi-movie set detected
      if (result.multiMovie) {
        setMultiMovieResult(result.multiMovie);
        // Auto-select detected formats into the format picker
        if (result.multiMovie.detected_formats?.length) {
          setFormats(result.multiMovie.detected_formats);
          setFormat(result.multiMovie.detected_formats[0]);
        }
        // Check which movies are already owned
        if (user) {
          const ownedMap: Record<number, string[]> = {};
          for (const movie of result.multiMovie.movies) {
            if (movie.tmdb_id) {
              const { data: existing } = await supabase
                .from("media_items").select("formats")
                .eq("user_id", user.id)
                .eq("external_id", String(movie.tmdb_id))
                .eq("media_type", activeTab)
                .limit(1);
              if (existing && existing.length > 0) {
                ownedMap[movie.tmdb_id] = existing[0].formats || [];
              }
            }
          }
          setMultiMovieOwned(ownedMap);
        }
        toast({ title: "Multi-Movie Set Detected!", description: `${result.multiMovie.product_title} — ${result.multiMovie.movies.length} titles found` });
      } else if (result.direct) {
        applyResult(result.direct);
        await checkOwnership(result.direct.title, upc.trim());
        toast({ title: "Found it!", description: result.direct.title });
      } else if (result.results && result.results.length > 0) {
        setSearchResults(result.results);
        toast({ title: "Multiple results found", description: "Select the correct one below." });
      } else if (result.partialTitle) {
        // Barcode found a product name but no TMDB match — pre-populate for the user
        setTitle(result.partialTitle);
        if (result.partialFormats?.length) setFormats(result.partialFormats);
        toast({ title: "Barcode not recognized", description: "Please verify the title below and search manually.", variant: "default" });
      } else {
        toast({ title: "Barcode not recognized", description: "Please enter the title below and search.", variant: "default" });
      }
    } catch {
      toast({ title: "Lookup failed", variant: "destructive" });
    }
    setLookingUp(false);
  };

  const handleSearch = async () => {
    if (!title.trim()) return;
    setLookingUp(true);
    try {
      const yearNum = year ? parseInt(year) : undefined;
      const results = await searchMedia(activeTab, title, { year: yearNum });
      setSearchResults(results);
      if (results.length === 0) {
        toast({ title: "No results", description: "Try a different title." });
      }
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    }
    setLookingUp(false);
  };

  const applyResult = (r: MediaLookupResult) => {
    setTitle(r.title);
    if (r.year) setYear(String(r.year));
    if (r.genre) setGenre(r.genre);
    if (r.cover_url) setSelectedPoster(r.cover_url);
    if (r.artist || r.author) setArtist(r.artist || r.author || "");
    // Auto-apply detected formats from barcode lookup
    if (r.detected_formats && r.detected_formats.length > 0) {
      setFormats(r.detected_formats);
      setFormat(r.detected_formats[0]);
    }

    const meta: Record<string, any> = {};
    if (r.runtime) meta.runtime = r.runtime;
    if (r.tagline) meta.tagline = r.tagline;
    if (r.overview) meta.overview = r.overview;
    if (r.description) meta.overview = r.description;
    if (r.cast) meta.cast = r.cast;
    if (r.crew) meta.crew = r.crew;
    if (r.page_count) meta.page_count = r.page_count;
    if (r.publisher) meta.publisher = r.publisher;
    if (r.isbn) meta.isbn = r.isbn;
    if (r.label) meta.label = r.label;
    if (r.tracklist && r.tracklist.length > 0) meta.tracklist = r.tracklist;
    if (r.platforms && r.platforms.length > 0) meta.platforms = r.platforms;
    if (r.developer) meta.developer = r.developer;
    if (r.source) meta.source = r.source;
    setExtraMeta(meta);
  };

  const toggleMultiSelect = (result: MediaLookupResult) => {
    setMultiSelect((prev) => {
      const exists = prev.some((r) => r.id === result.id);
      if (exists) return prev.filter((r) => r.id !== result.id);
      return [...prev, result];
    });
  };

  const selectResult = (result: MediaLookupResult) => {
    applyResult(result);
    setSearchResults([]);
    setMultiSelect([]);
    // Check ownership by title
    checkOwnership(result.title, barcode || undefined);
  };

  const handleBatchAdd = async () => {
    if (multiSelect.length === 0 || !user) return;
    setSaving(true);
    try {
      const rows = multiSelect.map((r) => ({
        user_id: user.id,
        title: r.title,
        year: r.year ?? null,
        format: null,
        formats: [] as string[],
        genre: r.genre ?? null,
        poster_url: r.cover_url ?? null,
        want_to_watch: true,
        media_type: activeTab,
        metadata: {
          ...(r.artist ? { artist: r.artist } : {}),
          ...(r.author ? { author: r.author } : {}),
          ...(r.overview || r.description ? { overview: r.overview || r.description } : {}),
          ...(r.source ? { source: r.source } : {}),
        },
      }));
      const { error } = await supabase.from("media_items").insert(rows);
      if (error) throw error;
      toast({ title: "Added!", description: `${multiSelect.length} titles added to ${labels.wantAction}.` });
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
      resetForm();
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const effectiveWantToWatch = (!format && formats.length === 0) ? true : wantToWatch;

  const handleAddMultiMovie = async () => {
    if (!multiMovieResult || !user) return;
    setMultiMovieSaving(true);
    try {
      const { mediaItemIds } = await createMultiMovieProduct(
        user.id,
        {
          barcode: barcode || null,
          productTitle: multiMovieResult.collection_name || multiMovieResult.product_title,
          formats: multiMovieResult.detected_formats,
          mediaType: activeTab,
          discCount: multiMovieResult.movies.length,
        },
        multiMovieResult.movies.map(m => ({
          tmdb_id: m.tmdb_id,
          title: m.title,
          year: m.year,
          poster_url: m.poster_url,
          overview: m.overview || null,
        }))
      );
      toast({ title: "Added!", description: `${multiMovieResult.movies.length} titles added from "${multiMovieResult.product_title}"` });
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
      resetForm();
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    }
    setMultiMovieSaving(false);
  };

  const handleSave = async () => {
    if (!title.trim() || !user) return;
    setSaving(true);
    try {
      const metaPayload: Record<string, any> = { ...extraMeta };
      if (artist && isMusicTab) {
        metaPayload["artist"] = artist;
      }

      const tmdbId = extraMeta.tmdb_id || null;
      const effectiveFormats = formats.length > 0 ? formats : (format ? [format] : []);

      const { data: newItem, error } = await supabase.from("media_items").insert({
        user_id: user.id,
        title: title.trim(),
        year: year ? parseInt(year) : null,
        format: effectiveFormats[0] || null,
        formats: effectiveFormats,
        barcode: barcode || null,
        genre: genre || null,
        notes: notes || null,
        poster_url: selectedPoster || null,
        in_plex: inPlex,
        digital_copy: format === "Digital" ? true : digitalCopy,
        wishlist,
        want_to_watch: effectiveWantToWatch,
        media_type: activeTab,
        external_id: tmdbId ? String(tmdbId) : null,
        metadata: Object.keys(metaPayload).length > 0 ? metaPayload : {},
      } as any).select().single();
      if (error) throw error;

      // Also create a physical_product + media_copy record
      try {
        await createPhysicalProductForItem(user.id, newItem.id, {
          barcode: barcode || null,
          productTitle: title.trim(),
          formats: effectiveFormats,
          mediaType: activeTab,
          format: effectiveFormats[0] || null,
        });
      } catch (ppErr) {
        console.warn("Physical product creation failed (non-critical):", ppErr);
      }

      toast({ title: "Added!", description: `${title} added to your collection.` });
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
      resetForm();
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  useEffect(() => { if (!open) stopScanner(); }, [open]);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add {labels.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Barcode scanner */}
          {hasBarcode && (
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
                  <Button size="sm" variant="destructive" className="absolute top-2 right-2" onClick={stopScanner}>Stop</Button>
                </div>
              )}
            </div>
          )}

          {/* Title + search */}
          <div className="space-y-2">
            <Label className="text-foreground">Title *</Label>
            <div className="flex gap-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={labels.searchPlaceholder}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button variant="outline" size="icon" onClick={handleSearch} disabled={lookingUp || !title.trim()}>
                {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Artist field for music */}
          {isMusicTab && (
            <div className="space-y-2">
              <Label className="text-foreground">Artist</Label>
              <Input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Artist / band name…"
              />
            </div>
          )}

          {/* Search results grid */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] text-muted-foreground">
                  {multiSelectMode ? "Tap to select/deselect" : "Tap to fill form"}
                </p>
                <Button
                  variant={multiSelectMode ? "default" : "outline"}
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={() => { setMultiSelectMode(!multiSelectMode); if (multiSelectMode) setMultiSelect([]); }}
                >
                  <Check className="h-3 w-3" /> Multi-select
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {searchResults.slice(0, 8).map((r) => {
                  const isSelected = multiSelect.some((s) => s.id === r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => multiSelectMode ? toggleMultiSelect(r) : selectResult(r)}
                      className={`relative rounded-md overflow-hidden border-2 transition-colors ${isSelected ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary"}`}
                    >
                      {r.cover_url ? (
                        <img src={r.cover_url} alt={r.title} className="w-full aspect-[2/3] object-cover" />
                      ) : (
                        <div className="w-full aspect-[2/3] bg-secondary flex items-center justify-center">
                          <p className="text-[9px] text-muted-foreground p-1 text-center">{r.title}</p>
                        </div>
                      )}
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                          <Check className="w-3 h-3 text-primary-foreground" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-background/90 p-1">
                        <p className="text-[9px] font-medium text-foreground truncate">{r.title}</p>
                        <p className="text-[8px] text-muted-foreground">
                          {r.artist || r.author || ""}{r.year ? ` (${r.year})` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {multiSelect.length > 0 && (
                <Button onClick={handleBatchAdd} disabled={saving} className="w-full gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  Add {multiSelect.length} to {labels.wantAction}
                </Button>
              )}
            </div>
          )}

          {/* Multi-Movie Set Detected */}
          {multiMovieResult && (
            <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-semibold text-foreground text-sm">Multi-Movie Set Detected</p>
                  <p className="text-xs text-muted-foreground">{multiMovieResult.collection_name || multiMovieResult.product_title}</p>
                </div>
              </div>
              {multiMovieResult.detected_formats.length > 0 && (
                <div className="flex gap-1">
                  {multiMovieResult.detected_formats.map(f => (
                    <span key={f} className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/20 text-primary border border-primary/30">{f}</span>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {multiMovieResult.movies.map((movie, i) => {
                  const ownedFormats = movie.tmdb_id ? multiMovieOwned[movie.tmdb_id] : undefined;
                  const isOwned = ownedFormats !== undefined;
                  return (
                    <div key={i} className={`relative flex gap-2 items-start p-2 rounded-md bg-background border ${isOwned ? "border-warning/50" : "border-border"}`}>
                      {isOwned && (
                        <Badge variant="outline" className="absolute -top-2 -right-1 text-[8px] bg-warning/20 text-warning border-warning/40 px-1.5 py-0">
                          Already owned{ownedFormats.length > 0 ? ` (${ownedFormats.join(", ")})` : ""}
                        </Badge>
                      )}
                      {movie.poster_url ? (
                        <img src={movie.poster_url} alt={movie.title} className="w-10 h-14 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-10 h-14 rounded bg-secondary shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{movie.title}</p>
                        {movie.year && <p className="text-[10px] text-muted-foreground">{movie.year}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Button onClick={handleAddMultiMovie} disabled={multiMovieSaving} className="w-full gap-2">
                {multiMovieSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Add All {multiMovieResult.movies.length} Movies to Collection
              </Button>
            </div>
          )}

          {/* Ownership warning */}
          {ownershipWarning && !multiMovieResult && (
            <div className={`flex items-start gap-2 rounded-md border p-3 ${
              ownershipWarning.type === "barcode" 
                ? "border-warning/40 bg-warning/10" 
                : "border-primary/40 bg-primary/10"
            }`}>
              {ownershipWarning.type === "barcode" ? (
                <Copy className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              ) : (
                <Layers className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              )}
              <div className="text-xs">
                <p className="font-medium text-foreground">
                  {ownershipWarning.type === "barcode" 
                    ? `Already in collection as "${ownershipWarning.existingTitle}"`
                    : `You own "${ownershipWarning.existingTitle}"`}
                  {ownershipWarning.existingFormats.length > 0 && (
                    <span className="font-semibold"> on {ownershipWarning.existingFormats.join(", ")}</span>
                  )}
                </p>
                <p className="text-muted-foreground mt-0.5">
                  {ownershipWarning.type === "barcode" 
                    ? "You can still add it if this is a different copy."
                    : "This may be a different edition — you can still add it."}
                </p>
              </div>
            </div>
          )}

          {/* Poster preview */}
          {selectedPoster && (
            <div className="flex justify-center">
              <img src={selectedPoster} alt="Cover" className="h-32 rounded-md border border-border" />
            </div>
          )}

          {/* Extra info from lookup */}
          {extraMeta.publisher && (
            <p className="text-xs text-muted-foreground">Publisher: {extraMeta.publisher}</p>
          )}
          {extraMeta.label && (
            <p className="text-xs text-muted-foreground">Label: {extraMeta.label}</p>
          )}
          {extraMeta.developer && (
            <p className="text-xs text-muted-foreground">Developer: {extraMeta.developer}</p>
          )}
          {extraMeta.platforms && extraMeta.platforms.length > 0 && (
            <p className="text-xs text-muted-foreground">Platforms: {extraMeta.platforms.join(", ")}</p>
          )}
          {extraMeta.tracklist && extraMeta.tracklist.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Tracklist</p>
              <div className="text-xs text-muted-foreground max-h-28 overflow-y-auto space-y-0.5">
                {extraMeta.tracklist.map((t: any, i: number) => (
                  <p key={i}>{t.position || i + 1}. {t.title} {t.duration ? `(${t.duration})` : ""}</p>
                ))}
              </div>
            </div>
          )}

          {/* Year + Format */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-foreground">Year</Label>
              <Input value={year} onChange={(e) => setYear(e.target.value)} placeholder="2024" type="number" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Format</Label>
              {formats.length > 0 ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {formats.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                        {f}
                        <button onClick={() => {
                          const next = formats.filter((x) => x !== f);
                          setFormats(next);
                          setFormat(next[0] || "");
                        }} className="hover:text-destructive">×</button>
                      </span>
                    ))}
                  </div>
                  <Select value="" onValueChange={(v) => {
                    if (v && !formats.includes(v)) {
                      setFormats([...formats, v]);
                      if (!format) setFormat(v);
                    }
                  }}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="+ Add format" /></SelectTrigger>
                    <SelectContent>
                      {(FORMATS[activeTab] || []).filter((f) => !formats.includes(f)).map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">Auto-detected from barcode</p>
                </div>
              ) : (
                <>
                  <Select value={format || "none"} onValueChange={(v) => {
                    const val = v === "none" ? "" : v;
                    setFormat(val);
                    setFormats(val ? [val] : []);
                  }}>
                    <SelectTrigger><SelectValue placeholder={`None (${labels.wantAction.toLowerCase()})`} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None ({labels.wantAction.toLowerCase()})</SelectItem>
                      {(FORMATS[activeTab] || []).map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!format && (
                    <p className="text-[10px] text-muted-foreground">No format → auto-add to {labels.wantAction}</p>
                  )}
                </>
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
            {isMovieTab && (
              <div className="flex items-center justify-between">
                <Label className="text-foreground text-sm">In Plex</Label>
                <Switch checked={inPlex} onCheckedChange={setInPlex} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm">Digital Copy</Label>
              <Switch checked={digitalCopy} onCheckedChange={setDigitalCopy} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm">Wishlist</Label>
              <Switch checked={wishlist} onCheckedChange={setWishlist} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-foreground text-sm">{labels.wantAction}</Label>
              <Switch checked={wantToWatch} onCheckedChange={setWantToWatch} />
            </div>
          </div>

          {/* Save */}
          <Button onClick={handleSave} disabled={saving || !title.trim()} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {saving ? "Adding…" : "Add to Collection"}
          </Button>

          {/* Link to bulk scan */}
          {hasBarcode && (
            <p className="text-center text-xs text-muted-foreground">
              Want to scan multiple items at once? Use the{" "}
              <button
                type="button"
                className="text-primary underline hover:text-primary/80"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                  // Small delay to let dialog close, then click the bulk scan button
                  setTimeout(() => {
                    const bulkBtn = document.querySelector('[title="Bulk Scan"]') as HTMLButtonElement;
                    bulkBtn?.click();
                  }, 300);
                }}
              >
                Bulk Scan
              </button>{" "}
              button in the toolbar.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
