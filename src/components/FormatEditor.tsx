import { Badge } from "@/components/ui/badge";
import { MediaTab, FORMATS } from "@/lib/types";

interface FormatEditorProps {
  formats: string[];
  mediaType: MediaTab;
  onToggle: (format: string) => void;
}

const getFormatVariant = (f: string, active: boolean) => {
  if (!active) return "outline" as const;
  if (f === "4K") return "4k" as const;
  if (f === "Blu-ray") return "bluray" as const;
  return "secondary" as const;
};

export function FormatEditor({ formats, mediaType, onToggle }: FormatEditorProps) {
  const available = FORMATS[mediaType] || [];

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Formats Owned</p>
      <div className="flex flex-wrap gap-1.5">
        {available.map((f) => {
          const active = formats.includes(f);
          return (
            <Badge
              key={f}
              variant={getFormatVariant(f, active)}
              className={`cursor-pointer select-none transition-opacity ${!active ? "opacity-40 hover:opacity-70" : ""}`}
              onClick={() => onToggle(f)}
            >
              {f}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
