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
import { GenerateCoverArtButton } from "@/components/GenerateCoverArtButton";
import { useAuth } from "@/hooks/useAuth";

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

/** Detect composite/package-style titles and extract child candidates */
function extractChildCandidates(query: string): string[] {
  const lower = query.toLowerCase();
  const candidates: string[] = [];

  // "Title 1 & 2" or "Title 1 and 2" → "Title 1", "Title 2"
  const ampMatch = query.match(/^(.+?)\s+(\d+)\s*[&+]\s*(\d+)$/i);
  if (ampMatch) {
    const base = ampMatch[1].trim();
    candidates.push(`${base} ${ampMatch[2]}`, `${base} ${ampMatch[3]}`);
    // Also try base alone (e.g. "Ghostbusters")
    candidates.push(base);
    return candidates;
  }

  // Slash-separated: "Title A / Title B"
  if (query.includes(" / ")) {
    const parts = query.split(" / ").map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // Strip known composite suffixes and search the base title
  const compositePatterns = [
    /:\s*(triple|double|quad)\s*feature$/i,
    /\s*-\s*(triple|double|quad)\s*feature$/i,
    /:\s*(the\s+)?complete\s+(quest|collection|series|saga|set)$/i,
    /\s*-\s*(the\s+)?complete\s+(quest|collection|series|saga|set)$/i,
    /:\s*(collection|pack|gift\s*set|box\s*set|set)$/i,
    /\s*-\s*(collection|pack|gift\s*set|box\s*set|set)$/i,
  ];

  for (const pat of compositePatterns) {
    if (pat.test(query)) {
      const stripped = query.replace(pat, "").trim();
      if (stripped && stripped !== query) {
        candidates.push(stripped);
      }
      break;
    }
  }

  // Also check for "X feature" / "X collection" etc in the middle
  if (candidates.length === 0) {
    const featureMatch = lower.match(/(triple|double|quad)\s*feature/);
    const collMatch = lower.match(/(collection|pack|gift\s*set|box\s*set)/);
    if (featureMatch || collMatch) {
      // Try removing the composite keyword phrase and colon prefix
      let base = query.replace(/:\s*.*/i, "").trim();
      if (base && base !== query) candidates.push(base);
    }
  }

  return candidates;
}

/** Search with composite fallback: try exact query first, then child candidates */
async function searchWithCompositeFallback(
  query: string,
  year?: number
): Promise<{ results: TmdbResult[]; source: string }> {
  // Try exact query first
  const exactResults = await searchTmdb(query, year);
  if (exactResults.length > 0) {
    return { results: exactResults, source: "manual exact search" };
  }

  // Try child candidates
  const children = extractChildCandidates(query);
  if (children.length > 0) {
    const allChildResults: TmdbResult[] = [];
    const seen = new Set<number>();

    for (const child of children) {
      try {
        const childResults = await searchTmdb(child, undefined);
        for (const r of childResults) {
          if (!seen.has(r.tmdb_id)) {
            seen.add(r.tmdb_id);
            allChildResults.push(r);
          }
        }
      } catch {
        // continue to next child
      }
      // Small delay between searches
      if (children.indexOf(child) < children.length - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    if (allChildResults.length > 0) {
      return { results: allChildResults, source: "manual composite child match" };
    }
  }

  return { results: [], source: "no match" };
}

interface CoverSearchDialogProps {
  item: MediaItem;
  open: boolean;
  onClose: () => void;
}

export function CoverSearchDialog({ item, open, onClose }: CoverSearchDialogProps) {
  const { user } = useAuth();
  const isGame = item.mediaType === "games";
  const [query, setQuery] = useState(item.title);
  const [results, setResults] = useState<(TmdbResult | GameResult)[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loadingPosters, setLoadingPosters] = useState(false);
  const [selectedResult, setSelectedResult] = useState<TmdbResult | null>(null);
  const [altPosters, setAltPosters] = useState<TmdbPoster[]>([]);
  const [searchSource, setSearchSource] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const updateItem = useUpdateItem();

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSelectedResult(null);
    setAltPosters([]);
    setSearchSource("");
    try {
      if (isGame) {
        const res = await searchGames(query);
        setResults(res);
        setSearchSource("game lookup");
        if (res.length === 0) {
          toast({ title: "No results", description: "Try a different search term." });
        }
      } else {
        const { results: res, source } = await searchWithCompositeFallback(query);
        setResults(res);
        setSearchSource(source);
        if (res.length === 0) {
          toast({ title: "No results", description: "Try a different search term." });
        } else if (source.includes("child")) {
          toast({ title: "Showing related titles", description: "Package title not found — showing individual title matches." });
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

  /** Artwork-only update — does NOT overwrite title/genre/rating/year/cast */
  const handlePickPoster = async (posterUrl: string) => {
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to update cover art." });
      return;
    }
    try {
      const currentMeta = (item.metadata as Record<string, any>) || {};
      await updateItem.mutateAsync({
        id: item.id,
        poster_url: posterUrl,
        metadata: {
          ...currentMeta,
          artwork_source: searchSource || "manual selection",
          artwork_locked: true,
        },
      } as any);
      toast({ title: "Cover updated!" });
      onClose();
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const handlePickGameCover = async (result: GameResult) => {
    if (!result.cover_url) return;
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to update cover art." });
      return;
    }
    try {
      const currentMeta = (item.metadata as Record<string, any>) || {};
      await updateItem.mutateAsync({
        id: item.id,
        poster_url: result.cover_url,
        metadata: {
          ...currentMeta,
          artwork_source: "manual game cover selection",
          artwork_locked: true,
        },
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
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to upload a custom cover." });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

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

      const currentMeta = (item.metadata as Record<string, any>) || {};
      await updateItem.mutateAsync({
        id: item.id,
        poster_url: publicUrl,
        metadata: { ...currentMeta, artwork_source: "manual upload", artwork_locked: true },
      } as any);
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

              {/* AI Generate */}
              <div className="border-t border-border pt-4">
                <p className="text-xs text-muted-foreground mb-2">Generate a unique AI cover:</p>
                <GenerateCoverArtButton
                  title={item.title}
                  artist={(item.metadata as any)?.artist || (item as any).artist}
                  genre={item.genre}
                  mediaType={item.mediaType}
                  onGenerated={(url) => {
                    if (!user) {
                      toast({ title: "Sign in required", description: "Sign in to apply generated cover art." });
                      return;
                    }
                    const currentMeta = (item.metadata as Record<string, any>) || {};
                    updateItem.mutate({
                      id: item.id,
                      poster_url: url,
                      metadata: { ...currentMeta, artwork_source: "AI generated", artwork_locked: true },
                    } as any);
                    toast({ title: "AI cover applied!" });
                    onClose();
                  }}
                  size="default"
                  variant="outline"
                />
              </div>

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
