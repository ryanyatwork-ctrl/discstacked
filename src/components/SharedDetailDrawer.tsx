import { MediaItem } from "@/lib/types";
import { getEditionLabel } from "@/lib/edition-utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, Eye, ExternalLink, ImageIcon, Monitor, Download, Barcode, Clock, Tag, Disc, Package, HardDrive, Shield, Layers, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { DiscEditor, DiscEntry } from "@/components/DiscEditor";
import { CollectionEditor } from "@/components/CollectionEditor";

interface SharedDetailDrawerProps {
  item: MediaItem | null;
  open: boolean;
  onClose: () => void;
  itemList?: MediaItem[];
  onNavigate?: (item: MediaItem) => void;
}

const getFormatVariant = (f: string) =>
  f === "4K" ? "4k" as const
  : f === "Blu-ray" ? "bluray" as const
  : f === "DVD" ? "dvd" as const
  : f === "Vinyl" ? "vinyl" as const
  : "secondary" as const;

function ConditionBadge({ condition }: { condition: string }) {
  const colorMap: Record<string, string> = {
    Mint: "bg-success/20 text-success border-success/30",
    "Near Mint": "bg-success/10 text-success border-success/20",
    Good: "bg-primary/10 text-primary border-primary/20",
    Fair: "bg-warning/10 text-warning border-warning/20",
    Poor: "bg-destructive/10 text-destructive border-destructive/20",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${colorMap[condition] || ""}`}>
      {condition}
    </Badge>
  );
}

export function SharedDetailDrawer({ item, open, onClose, itemList, onNavigate }: SharedDetailDrawerProps) {
  if (!item) return null;

  const currentIndex = itemList?.findIndex((i) => i.id === item.id) ?? -1;
  const prevItem = currentIndex > 0 ? itemList![currentIndex - 1] : null;
  const nextItem = currentIndex >= 0 && currentIndex < (itemList?.length ?? 0) - 1 ? itemList![currentIndex + 1] : null;

  const formats = item.formats && item.formats.length > 0 ? item.formats : item.format ? [item.format] : [];
  const meta = (item.metadata && typeof item.metadata === "object" ? item.metadata : {}) as Record<string, any>;
  const tags = (meta.tags as string[]) || [];
  const discs = (meta.discs as DiscEntry[]) || [];

  const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(item.title)}+${encodeURIComponent(item.format || "")}&tag=bookstacked05-20`;

  const formatRuntime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };


  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg bg-card border-border overflow-y-auto">
        <SheetHeader className="sr-only">
          <SheetTitle>{item.title}</SheetTitle>
        </SheetHeader>

          {/* Navigation bar */}
          <div className="flex items-center justify-between py-2 border-b border-border mb-2">
            <Button variant="ghost" size="sm" onClick={onClose} className="gap-1 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={!prevItem} onClick={() => prevItem && onNavigate?.(prevItem)} className="gap-1 text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <Button variant="ghost" size="sm" disabled={!nextItem} onClick={() => nextItem && onNavigate?.(nextItem)} className="gap-1 text-muted-foreground hover:text-foreground">
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-5">
          {/* Poster */}
          <div className="relative aspect-[2/3] w-full max-w-[280px] mx-auto rounded-md overflow-hidden">
            {item.posterUrl ? (
              <img src={item.posterUrl} alt={item.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-secondary flex flex-col items-center justify-center gap-3">
                <ImageIcon className="w-12 h-12 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No cover art</p>
              </div>
            )}
          </div>

          {/* Title + Year + Format badges */}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground break-words">{item.title}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              {item.year && <span className="text-sm text-muted-foreground">{item.year}</span>}
              {formats.map((f) => (
                <Badge key={f} variant={getFormatVariant(f)}>{f}</Badge>
              ))}
            </div>
          </div>

          {/* Edition & Case */}
          {(meta.edition || meta.case_type || meta.distributor || meta.region || meta.disc_layers) && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {meta.edition && (
                <div>
                  <span className="text-xs text-muted-foreground">Edition</span>
                  <p className="text-sm text-foreground">{meta.edition}</p>
                </div>
              )}
              {meta.case_type && (
                <div>
                  <span className="text-xs text-muted-foreground">Case</span>
                  <p className="text-sm text-foreground">{meta.case_type}</p>
                </div>
              )}
              {meta.slipcover && (
                <div>
                  <span className="text-xs text-muted-foreground">Slipcover</span>
                  <p className="text-sm text-foreground">{meta.slipcover === "yes" ? "Yes" : "No"}</p>
                </div>
              )}
              {meta.condition && (
                <div>
                  <span className="text-xs text-muted-foreground">Condition</span>
                  <p className="text-sm text-foreground flex items-center gap-1">
                    <ConditionBadge condition={meta.condition} />
                  </p>
                </div>
              )}
              {meta.distributor && (
                <div>
                  <span className="text-xs text-muted-foreground">Distributor</span>
                  <p className="text-sm text-foreground">{meta.distributor}</p>
                </div>
              )}
              {meta.region && (
                <div>
                  <span className="text-xs text-muted-foreground">Region</span>
                  <p className="text-sm text-foreground">{meta.region}</p>
                </div>
              )}
              {meta.disc_layers && (
                <div>
                  <span className="text-xs text-muted-foreground">Layers</span>
                  <p className="text-sm text-foreground">{meta.disc_layers}</p>
                </div>
              )}
            </div>
          )}

          {/* Discs */}
          {discs.length > 0 && (
            <DiscEditor discs={discs} onChange={() => {}} readOnly />
          )}

          {/* Digital code & rip status */}
          {(meta.digital_code_status || meta.rip_status) && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {meta.digital_code_status && meta.digital_code_status !== "Not Included" && (
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground">Digital Code</span>
                  <p className="text-sm text-foreground">
                    {meta.digital_code_status}
                    {meta.digital_code_platform && ` — ${meta.digital_code_platform}`}
                  </p>
                </div>
              )}
              {meta.rip_status && meta.rip_status !== "Not Ripped" && (
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground">Rip Status</span>
                  <p className={`text-sm flex items-center gap-1 ${meta.rip_status === "Unrippable" ? "text-destructive" : "text-foreground"}`}>
                    {meta.rip_status === "Ripped" && <HardDrive className="w-3 h-3 text-success" />}
                    {meta.rip_status === "Unrippable" && <Shield className="w-3 h-3 text-destructive" />}
                    {meta.rip_status}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Metadata (all media types) */}
          {(item.genre || meta.runtime || meta.tagline || meta.cast?.length || meta.crew
            || meta.artist || meta.author || meta.tracklist?.length || meta.page_count
            || meta.publisher || meta.label || meta.developer || meta.platforms?.length || meta.overview) && (
            <div className="space-y-3">
              {/* Artist / Author */}
              {(meta.artist || meta.author) && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                    {meta.author ? "Author" : "Artist"}
                  </p>
                  <p className="text-sm text-foreground">{(meta.author || meta.artist) as string}</p>
                </div>
              )}

              {item.genre && (
                <div className="flex items-center gap-2 flex-wrap">
                  {item.genre.split(",").map((g: string) => (
                    <Badge key={g.trim()} variant="outline" className="text-[10px]">{g.trim()}</Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                {meta.runtime && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatRuntime(meta.runtime as number)}
                  </span>
                )}
                {meta.page_count && <span>{meta.page_count as number} pages</span>}
                {meta.publisher && <span>Published by {meta.publisher as string}</span>}
                {meta.label && <span>Label: {meta.label as string}</span>}
                {meta.developer && <span>Developer: {meta.developer as string}</span>}
                {meta.isbn && <span className="font-mono text-xs">ISBN: {meta.isbn as string}</span>}
              </div>

              {/* Platforms (games) */}
              {meta.platforms && (meta.platforms as string[]).length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(meta.platforms as string[]).map((p) => (
                    <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>
                  ))}
                </div>
              )}

              {meta.tagline && (
                <p className="text-sm text-muted-foreground italic">"{meta.tagline as string}"</p>
              )}
              {meta.overview && (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">{meta.overview as string}</p>
              )}

              {/* Tracklist (music) */}
              {meta.tracklist && (meta.tracklist as any[]).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Tracklist</p>
                  <div className="text-xs max-h-32 overflow-y-auto space-y-0.5">
                    {(meta.tracklist as any[]).map((t: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-muted-foreground">
                        <span><span className="text-foreground">{t.position || i + 1}.</span> {t.title}</span>
                        {t.duration && <span className="tabular-nums">{t.duration}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cast */}
              {meta.cast && (meta.cast as any[]).length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Cast</p>
                  <div className="grid grid-cols-1 gap-1">
                    {(meta.cast as any[]).slice(0, 6).map((c: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {c.profile_url ? (
                          <img src={c.profile_url} alt={c.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-secondary shrink-0" />
                        )}
                        <span className="text-foreground font-medium truncate">{c.name}</span>
                        {c.character && <span className="text-muted-foreground truncate">as {c.character}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Crew */}
              {meta.crew && ((meta.crew as any).director?.length || (meta.crew as any).writer?.length || (meta.crew as any).producer?.length) && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Crew</p>
                  <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs">
                    {(meta.crew as any).director?.length > 0 && (
                      <>
                        <span className="text-muted-foreground font-medium">Director</span>
                        <span className="text-foreground">{(meta.crew as any).director.join(", ")}</span>
                      </>
                    )}
                    {(meta.crew as any).writer?.length > 0 && (
                      <>
                        <span className="text-muted-foreground font-medium">Writer</span>
                        <span className="text-foreground">{(meta.crew as any).writer.join(", ")}</span>
                      </>
                    )}
                    {(meta.crew as any).producer?.length > 0 && (
                      <>
                        <span className="text-muted-foreground font-medium">Producer</span>
                        <span className="text-foreground">{(meta.crew as any).producer.join(", ")}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                <Tag className="w-3 h-3" /> Tags
              </p>
              <div className="flex items-center gap-1 flex-wrap">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-[10px]">#{tag}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Barcode */}
          {item.barcode && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                <Barcode className="w-3 h-3" /> UPC / Barcode
              </p>
              <p className="text-sm text-muted-foreground font-mono">{item.barcode}</p>
            </div>
          )}

          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            {item.inPlex && (
              <Badge variant="secondary" className="gap-1">
                <Monitor className="w-3 h-3" /> In Plex
              </Badge>
            )}
            {item.digitalCopy && (
              <Badge variant="secondary" className="gap-1">
                <Download className="w-3 h-3" /> Digital Copy
              </Badge>
            )}
            {item.wishlist && (
              <Badge variant="destructive" className="gap-1">
                <Heart className="w-3 h-3" /> Wishlist
              </Badge>
            )}
            {item.wantToWatch && (
              <Badge variant="secondary" className="gap-1">
                <Eye className="w-3 h-3" /> Want to Watch
              </Badge>
            )}
          </div>

          {/* Copies */}
          {(item.totalCopies ?? 1) > 1 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium flex items-center gap-1">
                <Layers className="w-3 h-3" /> Copies Owned
              </p>
              <p className="text-sm text-foreground">{item.totalCopies} copies</p>
            </div>
          )}

          {/* Collection / Box Set info */}
          <CollectionEditor item={item} readOnly />

          {/* Notes */}
          {item.notes && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Notes</p>
              <p className="text-sm text-muted-foreground">{item.notes}</p>
            </div>
          )}

          {/* Amazon link for wishlist items */}
          {item.wishlist && (
            <Button
              variant="outline"
              className="w-full border-primary/30 text-primary hover:bg-primary/10"
              onClick={() => window.open(amazonUrl, "_blank")}
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Buy on Amazon
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
