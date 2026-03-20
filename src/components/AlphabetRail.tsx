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
    <Select
      value={activeLetter ?? ""}
      onValueChange={(val) => onLetterClick(val)}
    >
      <SelectTrigger className="w-16 h-8 bg-card/90 backdrop-blur-sm border-border text-foreground text-xs font-semibold justify-center px-2 gap-1 shrink-0">
        <SelectValue placeholder="A-Z" />
      </SelectTrigger>
      <SelectContent
        side="bottom"
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
  );
}
