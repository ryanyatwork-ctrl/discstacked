import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchTmdb, TmdbResult } from "@/lib/tmdb";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateItem } from "@/hooks/useMediaItems";
import { toast } from "@/hooks/use-toast";
import { Search, Upload, Loader2 } from "lucide-react";
import { MediaItem } from "@/lib/types";

interface CoverSearchDialogProps {
  item: MediaItem;
  open: boolean;
  onClose: () => void;
}

export function CoverSearchDialog({ item, open, onClose }: CoverSearchDialogProps) {
  const [query, setQuery] = useState(item.title);
  const [results, setResults] = useState<TmdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const updateItem = useUpdateItem();

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      // Search both movies and TV (including season detection)
      const res = await searchTmdb(query, undefined);
      setResults(res);
      if (res.length === 0) {
        toast({ title: "No results", description: "Try a different search term." });
      }
    } catch {
      toast({ title: "Search failed", variant: "destructive" });
    }
    setSearching(false);
  };

  const handleSelect = async (result: TmdbResult) => {
    try {
      await updateItem.mutateAsync({
        id: item.id,
        poster_url: result.poster_url,
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

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Find Cover Art</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search movies & TV shows…"
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searching} size="icon">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {/* Results */}
          {results.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {results.map((r) => (
                <button
                  key={`${r.media_type}-${r.tmdb_id}`}
                  onClick={() => handleSelect(r)}
                  className="group relative rounded-md overflow-hidden border border-border hover:border-primary transition-colors"
                >
                  {r.poster_url ? (
                    <img src={r.poster_url} alt={r.title} className="w-full aspect-[2/3] object-cover" />
                  ) : (
                    <div className="w-full aspect-[2/3] bg-secondary flex items-center justify-center">
                      <p className="text-xs text-muted-foreground p-2 text-center">{r.title}</p>
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-background/90 p-1.5">
                    <p className="text-[10px] font-medium text-foreground truncate">{r.title}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {r.year} · {r.media_type === "tv" || r.media_type === "tv_season" ? "TV" : "Movie"}
                    </p>
                  </div>
                </button>
              ))}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
