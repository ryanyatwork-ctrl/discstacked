import { ALPHABET } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRef, useEffect } from "react";

interface AlphabetRailProps {
  activeLetter: string | null;
  onLetterClick: (letter: string) => void;
  availableLetters: Set<string>;
  onClearLetter?: () => void;
}

export function AlphabetRail({ activeLetter, onLetterClick, availableLetters, onClearLetter }: AlphabetRailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll active letter into view
  useEffect(() => {
    if (activeLetter && scrollRef.current) {
      const btn = scrollRef.current.querySelector(`[data-letter="${activeLetter}"]`);
      btn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeLetter]);

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
