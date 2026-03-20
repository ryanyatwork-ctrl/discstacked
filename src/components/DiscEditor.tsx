import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, X, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const DISC_FORMATS = ["4K", "Blu-ray", "3D", "DVD", "CD", "Digital"];

export interface DiscEntry {
  label: string;
  format: string;
  missing?: boolean;
}

interface DiscEditorProps {
  discs: DiscEntry[];
  onChange: (discs: DiscEntry[]) => void;
  readOnly?: boolean;
}

const getFormatVariant = (f: string) =>
  f === "4K" ? "4k" as const
  : f === "Blu-ray" ? "bluray" as const
  : f === "DVD" ? "dvd" as const
  : f === "Digital" ? "digital" as const
  : "secondary" as const;

export function DiscEditor({ discs, onChange, readOnly }: DiscEditorProps) {
  if (readOnly) {
    if (!discs || discs.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Discs ({discs.length})</p>
        <div className="space-y-1">
          {discs.map((disc, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Badge variant={getFormatVariant(disc.format)} className="text-[10px]">{disc.format}</Badge>
              <span className={disc.missing ? "text-destructive line-through" : "text-foreground"}>
                {disc.label || `Disc ${i + 1}`}
              </span>
              {disc.missing && (
                <span className="flex items-center gap-0.5 text-destructive text-xs">
                  <AlertTriangle className="w-3 h-3" /> Missing
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const addDisc = () => {
    onChange([...discs, { label: "", format: "Blu-ray" }]);
  };

  const removeDisc = (index: number) => {
    onChange(discs.filter((_, i) => i !== index));
  };

  const updateDisc = (index: number, updates: Partial<DiscEntry>) => {
    onChange(discs.map((d, i) => i === index ? { ...d, ...updates } : d));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground font-medium">Discs</label>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={addDisc}>
          <Plus className="w-3 h-3" /> Add Disc
        </Button>
      </div>
      {discs.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No discs added yet. Click "Add Disc" to start.</p>
      )}
      {discs.map((disc, i) => (
        <div key={i} className="flex items-center gap-2">
          <Select value={disc.format} onValueChange={(v) => updateDisc(i, { format: v })}>
            <SelectTrigger className="h-8 text-sm w-28 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISC_FORMATS.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={disc.label}
            onChange={(e) => updateDisc(i, { label: e.target.value })}
            placeholder={`Disc ${i + 1} label`}
            className="h-8 text-sm flex-1"
          />
          <div className="flex items-center gap-1 shrink-0" title="Missing?">
            <Checkbox
              checked={disc.missing || false}
              onCheckedChange={(checked) => updateDisc(i, { missing: !!checked })}
              className="h-4 w-4"
            />
            <span className="text-[10px] text-muted-foreground">Missing</span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeDisc(i)}>
            <X className="w-3 h-3 text-muted-foreground" />
          </Button>
        </div>
      ))}
    </div>
  );
}
