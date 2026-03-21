import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchTmdb, TmdbResult, getTmdbPosters, TmdbPoster } from "@/lib/tmdb";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateItem } from "@/hooks/useMediaItems";
import { toast } from "@/hooks/use-toast";
import { Search, Upload, Loader2, ArrowLeft } from "lucide-react";
import { MediaItem } from "@/lib/types";

interface GameResult {
  id: string;
  title: string;
  year: number | null;
  cover_url: string | null;
  genre: string | null;
  rating: number | null;
}

async function searchGames(query: string): Promise<GameResult[]> {
  const { data, error } = await supabase.functions.invoke("game-lookup", {
    body: { query },
  });
  if (error) throw new Error(error.message);
  return (data.results || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    year: r.year || null,
    cover_url: r.cover_url || null,
    genre: r.genre || null,
    rating: r.rating || null,
  }));
}

interface CoverSearchDialogProps {
  item: MediaItem;
  open: boolean;
  onClose: () => void;
}

export function CoverSearchDialog({ item, open, onClose }: CoverSearchDialogProps) {
  const isGame = item.mediaType === "games";
  const [query, setQuery] = useState(item.title);
  const [results, setResults] = useState<(TmdbResult | GameResult)[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingPosters, setLoadingPosters] = useState(false);
  const [selectedResult, setSelectedResult] = useState<TmdbResult | null>(null);
  const [altPosters, setAltPosters] = useState<TmdbPoster[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const updateItem = useUpdateItem();

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSelectedResult(null);
    setAltPosters([]);
    try {
      if (isGame) {
        const res = await searchGames(query);
        setResults(res);
        if (res.length === 0) {
          toast({ title: "No results", description: "Try a different search term." });
        }
      } else {
        const res = await searchTmdb(query, undefined);
        setResults(res);
        if (res.length === 0) {
          toast({ title: "No results", description: "Try a different search term." });
        }
      }
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    }
    setSearching(false);
  };

  const handleSelectResult = async (result: TmdbResult) => {
    setSelectedResult(result);
    setLoadingPosters(true);
    try {
      const posters = await getTmdbPosters(result.tmdb_id, result.media_type as "movie" | "tv");
      setAltPosters(posters);
    } catch {
      setAltPosters([]);
    }
    setLoadingPosters(false);
  };

  const handlePickPoster = async (posterUrl: string) => {
    if (!selectedResult) return;
    try {
      await updateItem.mutateAsync({
        id: item.id,
        poster_url: posterUrl,
        ...(selectedResult.genre ? { genre: selectedResult.genre } : {}),
        ...(selectedResult.rating ? { rating: selectedResult.rating } : {}),
      } as any);
      toast({ title: "Cover updated!" });
      onClose();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const handlePickGameCover = async (result: GameResult) => {
    if (!result.cover_url) return;
    try {
      await updateItem.mutateAsync({
        id: item.id,
        poster_url: result.cover_url,
        ...(result.genre ? { genre: result.genre } : {}),
        ...(result.rating ? { rating: result.rating } : {}),
      } as any);
      toast({ title: "Cover updated!" });
      onClose();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${item.id}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("cover-art")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("cover-art")
        .getPublicUrl(path);

      await updateItem.mutateAsync({ id: item.id, poster_url: publicUrl } as any);
      toast({ title: "Custom cover uploaded!" });
      onClose();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const goBack = () => {
    setSelectedResult(null);
    setAltPosters([]);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {selectedResult ? "Choose a Poster" : "Find Cover Art"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Poster picker view */}
          {selectedResult ? (
            <>
              <Button variant="ghost" size="sm" onClick={goBack} className="gap-1.5 -ml-2">
                <ArrowLeft className="h-4 w-4" />
                Back to results
              </Button>
              <p className="text-sm text-muted-foreground">
                {selectedResult.title} ({selectedResult.year}) — {altPosters.length} poster{altPosters.length !== 1 ? "s" : ""} available
              </p>
              {loadingPosters ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {altPosters.map((p, idx) => (
                    <button
                      key={idx}
                      onClick={() => handlePickPoster(p.poster_url)}
                      className="group relative rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                    >
                      <img src={p.poster_url} alt={`Poster ${idx + 1}`} className="w-full aspect-[2/3] object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-background/90 p-1">
                        <p className="text-[9px] text-muted-foreground text-center">
                          {p.language?.toUpperCase() || "No lang"} · {p.width}×{p.height}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Search */}
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder={isGame ? "Search games…" : "Search movies & TV shows…"}
                  className="flex-1"
                />
                <Button onClick={handleSearch} disabled={searching} size="icon">
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>

              {/* Results */}
              {results.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {results.map((r) => {
                    const coverUrl = 'poster_url' in r ? r.poster_url : 'cover_url' in r ? r.cover_url : null;
                    const key = 'tmdb_id' in r ? `tmdb-${r.tmdb_id}` : r.id;
                    return (
                      <button
                        key={key}
                        onClick={() => {
                          if (isGame && coverUrl) {
                            // For games, directly pick the cover (no alt posters)
                            handlePickGameCover(r as GameResult);
                          } else if ('tmdb_id' in r) {
                            handleSelectResult(r as TmdbResult);
                          }
                        }}
                        className="group relative rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                      >
                        {coverUrl ? (
                          <img src={coverUrl} alt={r.title} className="w-full aspect-[2/3] object-cover" />
                        ) : (
                          <div className="w-full aspect-[2/3] bg-secondary flex items-center justify-center">
                            <p className="text-xs text-muted-foreground p-2 text-center">{r.title}</p>
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-background/90 p-1.5">
                          <p className="text-[10px] font-medium text-foreground truncate">{r.title}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {r.year}{isGame ? "" : ` · ${'media_type' in r && (r.media_type === "tv" || r.media_type === "tv_season") ? "TV" : "Movie"}`}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Upload custom */}
              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground mb-2">Or upload your own cover art:</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="w-full gap-2"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? "Uploading…" : "Upload Custom Image"}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
