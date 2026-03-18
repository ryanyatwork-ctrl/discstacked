import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shuffle, Film, Disc, Monitor, Download, RefreshCw } from "lucide-react";
import { MediaItem } from "@/lib/types";
import { motion, AnimatePresence } from "framer-motion";

interface RandomizerDialogProps {
  items: MediaItem[];
}

export function RandomizerDialog({ items }: RandomizerDialogProps) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<MediaItem | null>(null);
  const [spinning, setSpinning] = useState(false);

  const rollRandom = useCallback(() => {
    if (items.length === 0) return;
    setSpinning(true);

    // Quick visual shuffle effect
    let count = 0;
    const interval = setInterval(() => {
      setPick(items[Math.floor(Math.random() * items.length)]);
      count++;
      if (count >= 12) {
        clearInterval(interval);
        setPick(items[Math.floor(Math.random() * items.length)]);
        setSpinning(false);
      }
    }, 80);
  }, [items]);

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setPick(null);
      setTimeout(rollRandom, 200);
    }
  };

  const availableOn: string[] = [];
  if (pick) {
    if (pick.format) availableOn.push(pick.format);
    if (pick.inPlex) availableOn.push("Plex");
    if (pick.digitalCopy) availableOn.push("Digital");
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground"
          title="What to Watch"
        >
          <Shuffle className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Shuffle className="w-4 h-4 text-primary" />
            What to Watch
          </DialogTitle>
        </DialogHeader>
        <div className="py-6">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center">
              Your collection is empty. Import some titles first!
            </p>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={pick?.id ?? "empty"}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center text-center gap-4"
              >
                {/* Poster or placeholder */}
                <div className="w-32 h-48 rounded-lg overflow-hidden bg-secondary flex items-center justify-center">
                  {pick?.posterUrl ? (
                    <img src={pick.posterUrl} alt={pick.title} className="w-full h-full object-cover" />
                  ) : (
                    <Film className="w-10 h-10 text-muted-foreground/40" />
                  )}
                </div>

                {/* Title & Year */}
                <div className="space-y-1">
                  <p className={`text-lg font-bold text-foreground transition-opacity ${spinning ? "opacity-50" : "opacity-100"}`}>
                    {pick?.title ?? "Spinning..."}
                  </p>
                  {pick?.year && (
                    <p className="text-sm text-muted-foreground">{pick.year}</p>
                  )}
                </div>

                {/* Available formats */}
                {availableOn.length > 0 && !spinning && (
                  <div className="flex flex-wrap justify-center gap-2">
                    {availableOn.map((fmt) => (
                      <Badge key={fmt} variant="secondary" className="text-xs gap-1">
                        {fmt === "Plex" && <Monitor className="w-3 h-3" />}
                        {fmt === "Digital" && <Download className="w-3 h-3" />}
                        {fmt !== "Plex" && fmt !== "Digital" && <Disc className="w-3 h-3" />}
                        {fmt}
                      </Badge>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {/* Re-roll button */}
          {items.length > 0 && (
            <div className="flex justify-center mt-6">
              <Button
                onClick={rollRandom}
                disabled={spinning}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${spinning ? "animate-spin" : ""}`} />
                {spinning ? "Picking..." : "Pick Again"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
