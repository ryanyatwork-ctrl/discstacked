import { ALPHABET } from "@/lib/types";
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
}

export function AlphabetRail({ activeLetter, onLetterClick, availableLetters }: AlphabetRailProps) {
  const availableArray = ALPHABET.filter((l) => availableLetters.has(l));

  if (availableArray.length === 0) return null;

  return (
    <div className="fixed right-3 bottom-20 md:bottom-6 z-40">
      <Select
        value={activeLetter ?? ""}
        onValueChange={(val) => onLetterClick(val)}
      >
        <SelectTrigger className="w-12 h-10 bg-card/90 backdrop-blur-sm border-border text-foreground text-sm font-semibold justify-center px-0 gap-1">
          <SelectValue placeholder="A-Z" />
        </SelectTrigger>
        <SelectContent
          side="top"
          align="end"
          className="max-h-64 min-w-[3rem] w-14"
        >
          {availableArray.map((letter) => (
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
    </div>
  );
}
