import { ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFetchArtwork } from "@/hooks/useFetchArtwork";
import { toast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import type { DbMediaItem } from "@/hooks/useMediaItems";

interface FetchArtworkButtonProps {
  items: DbMediaItem[];
}

export function FetchArtworkButton({ items }: FetchArtworkButtonProps) {
  const { fetchArtwork, isRunning, progress } = useFetchArtwork();

  const missingCount = items.filter((i) => !i.poster_url).length;

  const handleClick = async () => {
    if (missingCount === 0) {
      toast({ title: "All set!", description: "Every item already has artwork." });
      return;
    }

    toast({ title: "Fetching artwork…", description: `Looking up ${missingCount} items on TMDB.` });

    const result = await fetchArtwork(items);
    toast({
      title: "Artwork fetch complete",
      description: `Found posters for ${result.found} of ${result.total} items.`,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isRunning || missingCount === 0}
        className="gap-2 border-primary/30 text-primary hover:bg-primary/10"
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImageIcon className="h-4 w-4" />
        )}
        {isRunning
          ? `Fetching… ${progress.done}/${progress.total}`
          : missingCount > 0
            ? `Fetch Artwork (${missingCount} missing)`
            : "All artwork found"}
      </Button>
      {isRunning && (
        <Progress value={(progress.done / progress.total) * 100} className="h-1.5" />
      )}
    </div>
  );
}
