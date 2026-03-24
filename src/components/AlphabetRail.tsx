import { ALPHABET } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRef, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AlphabetRailProps {
  activeLetter: string | null;
  onLetterClick: (letter: string) => void;
  availableLetters: Set<string>;
  onClearLetter?: () => void;
}

export function AlphabetRail({ activeLetter, onLetterClick, availableLetters, onClearLetter }: AlphabetRailProps) {
  const isMobile = useIsMobile();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isMobile && activeLetter && scrollRef.current) {
      const btn = scrollRef.current.querySelector(`[data-letter="${activeLetter}"]`);
      btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeLetter, isMobile]);

  // Mobile: compact dropdown
  if (isMobile) {
    return (
      <Select
        value={activeLetter ?? "__all__"}
        onValueChange={(val) => {
          if (val === "__all__") onClearLetter?.();
          else onLetterClick(val);
        }}
      >
        <SelectTrigger className="w-16 h-8 bg-card/90 backdrop-blur-sm border-border text-foreground text-xs font-semibold justify-center px-2 gap-1 shrink-0">
          <SelectValue placeholder="A-Z" />
        </SelectTrigger>
        <SelectContent side="bottom" align="end" className="max-h-64 min-w-[3rem] w-14">
          <SelectItem value="__all__" className="justify-center pl-2 pr-2 text-sm font-medium">
            All
          </SelectItem>
          {ALPHABET.filter((l) => availableLetters.has(l)).map((letter) => (
            <SelectItem
              key={letter}
              value={letter}
              className="justify-center pl-2 pr-2 text-sm font-medium"
            >
              {letter}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // Desktop: horizontal rail
  return (
    <div
      ref={scrollRef}
      className="flex items-center gap-0.5 overflow-x-auto scrollbar-none py-1 px-1"
    >
      <button
        onClick={() => onClearLetter?.()}
        className={cn(
          "shrink-0 px-2 py-1 text-[11px] font-bold rounded transition-colors",
          activeLetter === null
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        )}
      >
        All
      </button>
      {ALPHABET.map((letter) => {
        const available = availableLetters.has(letter);
        return (
          <button
            key={letter}
            data-letter={letter}
            disabled={!available}
            onClick={() => onLetterClick(letter)}
            className={cn(
              "shrink-0 w-6 h-6 flex items-center justify-center text-[11px] font-semibold rounded transition-colors",
              activeLetter === letter
                ? "bg-primary text-primary-foreground"
                : available
                  ? "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  : "text-muted-foreground/30 cursor-default"
            )}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}
