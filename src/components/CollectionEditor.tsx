import { useState } from "react";
import { MediaItem } from "@/lib/types";
import { useUpdateItem } from "@/hooks/useMediaItems";
import { usePhysicalProductsForItem } from "@/hooks/usePhysicalProducts";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Package, Pencil, Check, X, Plus, Trash2, Barcode, DollarSign, Calendar } from "lucide-react";

interface CollectionEditorProps {
  item: MediaItem;
  readOnly?: boolean;
}

export function CollectionEditor({ item, readOnly }: CollectionEditorProps) {
  const { data: physicalProducts, isLoading } = usePhysicalProductsForItem(item.id);
  const [editing, setEditing] = useState(false);
  const [isSet, setIsSet] = useState(false);
  const [titles, setTitles] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const updateItem = useUpdateItem();

  const hasPhysicalProducts = physicalProducts && physicalProducts.length > 0;
  const multiTitleProducts = (physicalProducts || []).filter((pp: any) => pp.is_multi_title && pp.linkedItems?.length > 0);
  const hasLinkedSets = multiTitleProducts.length > 0;

  // Legacy metadata-based collection info
  const meta = (item.metadata && typeof item.metadata === "object" ? item.metadata : {}) as Record<string, any>;
  const isBoxSet = meta.is_box_set === "true";
  let contents: string[] = [];
  try { contents = JSON.parse(meta.contents || "[]"); } catch {}
  const hasLegacyData = isBoxSet || contents.length > 0;

  // If we have real physical product data, show that instead of legacy metadata
  if (hasLinkedSets || hasPhysicalProducts) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
          <Package className="w-3 h-3" /> Physical Copies
        </p>

        {isLoading && (
          <p className="text-xs text-muted-foreground">Loading…</p>
        )}

        {(physicalProducts || []).map((pp: any) => (
          <div key={pp.id} className="rounded-md border border-border bg-secondary/50 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{pp.product_title}</p>
                {pp.edition && (
                  <p className="text-xs text-muted-foreground">{pp.edition}</p>
                )}
              </div>
              {pp.formats && pp.formats.length > 0 && (
                <div className="flex gap-1 shrink-0">
                  {pp.formats.map((f: string) => (
                    <Badge key={f} variant="secondary" className="text-[10px]">{f}</Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Barcode */}
            {pp.barcode && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Barcode className="w-3 h-3" />
                <span className="font-mono">{pp.barcode}</span>
              </div>
            )}

            {/* Purchase info */}
            {(pp.purchase_date || pp.purchase_price || pp.purchase_location) && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                {pp.purchase_date && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {pp.purchase_date}
                  </span>
                )}
                {pp.purchase_price != null && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    ${Number(pp.purchase_price).toFixed(2)}
                  </span>
                )}
                {pp.purchase_location && (
                  <span>{pp.purchase_location}</span>
                )}
              </div>
            )}

            {/* Linked movies (other movies in the same set) */}
            {pp.linkedItems && pp.linkedItems.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Also in this set:</p>
                <div className="flex flex-wrap gap-1.5">
                  {pp.linkedItems.map((linked: any) => (
                    <Badge key={linked.id} variant="outline" className="text-[10px] gap-1">
                      {linked.poster_url && (
                        <img src={linked.poster_url} alt="" className="w-3 h-4 rounded-sm object-cover" />
                      )}
                      {linked.title} {linked.year ? `(${linked.year})` : ""}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Legacy fallback: metadata-based collection editor
  if (!hasLegacyData && readOnly) return null;

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

  if (!editing) {
    return (
      <div className="space-y-2">
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

        {!hasLegacyData && !readOnly && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
              <Package className="w-3 h-3" /> Collection / Compilation
            </p>
            <Button variant="outline" size="sm" onClick={startEditing} className="gap-1.5 text-xs">
              <Plus className="w-3 h-3" /> Mark as multi-movie set
            </Button>
          </div>
        )}

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
