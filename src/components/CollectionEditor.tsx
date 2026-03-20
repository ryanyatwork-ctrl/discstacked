import { useState } from "react";
import { MediaItem } from "@/lib/types";
import { useUpdateItem } from "@/hooks/useMediaItems";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Package, Pencil, Check, X, Plus, Trash2 } from "lucide-react";

interface CollectionEditorProps {
  item: MediaItem;
  /** When true, hides edit controls (for shared view) */
  readOnly?: boolean;
}

function getCollectionMeta(item: MediaItem) {
  const meta = (item.metadata && typeof item.metadata === "object" ? item.metadata : {}) as Record<string, any>;
  const isBoxSet = meta.is_box_set === "true";
  let contents: string[] = [];
  try { contents = JSON.parse(meta.contents || "[]"); } catch {}
  let boxSets: { title: string; format: string }[] = [];
  try { boxSets = JSON.parse(meta.box_sets || "[]"); } catch {}
  return { isBoxSet, contents, boxSets, meta };
}

export function CollectionEditor({ item, readOnly }: CollectionEditorProps) {
  const { isBoxSet, contents, boxSets, meta } = getCollectionMeta(item);
  const [editing, setEditing] = useState(false);
  const [isSet, setIsSet] = useState(isBoxSet);
  const [titles, setTitles] = useState<string[]>(contents);
  const [newTitle, setNewTitle] = useState("");
  const updateItem = useUpdateItem();

  const hasData = isBoxSet || contents.length > 0 || boxSets.length > 0;

  if (!hasData && readOnly) return null;

  const startEditing = () => {
    setIsSet(isBoxSet);
    setTitles([...contents]);
    setNewTitle("");
    setEditing(true);
  };

  const addTitle = () => {
    const trimmed = newTitle.trim();
    if (trimmed && !titles.includes(trimmed)) {
      setTitles([...titles, trimmed]);
      setNewTitle("");
    }
  };

  const removeTitle = (idx: number) => {
    setTitles(titles.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    try {
      const currentMeta = { ...meta };
      if (isSet) {
        currentMeta.is_box_set = "true";
        currentMeta.contents = JSON.stringify(titles);
      } else {
        delete currentMeta.is_box_set;
        currentMeta.contents = "[]";
      }
      await updateItem.mutateAsync({ id: item.id, metadata: currentMeta } as any);
      toast({ title: "Collection info saved!" });
      setEditing(false);
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  // Read-only display for contained titles (shared view or non-editing)
  if (!editing) {
    return (
      <div className="space-y-2">
        {/* "Part of" links — this item belongs to box sets */}
        {boxSets.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
              <Package className="w-3 h-3" /> Part Of
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-secondary">
                <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground">Standalone copy</span>
              </div>
              {boxSets.map((bs, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-secondary">
                  <Package className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs text-foreground block truncate">Part of: {bs.title}</span>
                    <span className="text-[10px] text-muted-foreground">{bs.format}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collection contents — this item IS a box set */}
        {isBoxSet && contents.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                <Package className="w-3 h-3" /> Collection Contents ({contents.length} titles)
              </p>
              {!readOnly && (
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEditing}>
                  <Pencil className="w-3 h-3 text-muted-foreground" />
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {contents.map((c, i) => (
                <Badge key={i} variant="secondary" className="text-[10px]">{c}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* No data yet — show add button */}
        {!hasData && !readOnly && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
              <Package className="w-3 h-3" /> Collection / Compilation
            </p>
            <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5 text-xs">
              <Plus className="w-3 h-3" /> Mark as multi-movie set
            </Button>
          </div>
        )}

        {/* Has data but no contents listed yet — editing prompt */}
        {isBoxSet && contents.length === 0 && !readOnly && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
              <Package className="w-3 h-3" /> Collection Contents
            </p>
            <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5 text-xs">
              <Pencil className="w-3 h-3" /> Add contained titles
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Editing mode
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
          <Package className="w-3 h-3" /> Collection / Compilation
        </p>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={updateItem.isPending}>
            <Check className="w-4 h-4 text-success" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(false)}>
            <X className="w-4 h-4 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm text-foreground">This is a multi-movie set</label>
        <Switch checked={isSet} onCheckedChange={setIsSet} />
      </div>

      {isSet && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground font-medium">Contained Titles</label>
          {titles.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs flex-1 justify-start">{t}</Badge>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeTitle(i)}>
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTitle(); } }}
              placeholder="Add movie title…"
              className="h-8 text-sm"
            />
            <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={addTitle} disabled={!newTitle.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
