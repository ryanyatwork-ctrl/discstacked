import { ALPHABET } from "@/lib/types";
import { cn } from "@/lib/utils";

interface AlphabetRailProps {
  activeLetter: string | null;
  onLetterClick: (letter: string) => void;
  availableLetters: Set<string>;
}

export function AlphabetRail({ activeLetter, onLetterClick, availableLetters }: AlphabetRailProps) {
  return (
    <nav className="fixed right-1 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-0.5 py-2 px-1">
      {ALPHABET.map((letter) => {
        const available = availableLetters.has(letter);
        return (
          <button
            key={letter}
            onClick={() => available && onLetterClick(letter)}
            className={cn(
              "w-5 h-5 flex items-center justify-center text-[10px] font-medium rounded-sm transition-colors duration-100",
              activeLetter === letter && "bg-primary text-primary-foreground",
              activeLetter !== letter && available && "text-muted-foreground hover:text-foreground hover:bg-secondary",
              !available && "text-muted-foreground/30 cursor-default"
            )}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
