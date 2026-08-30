import { useState } from "react";
import { MediaItem, MediaTab } from "@/lib/types";
import { Disc, Film, Gamepad2, Star, Check, Edit3, Image, MapPin, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CollectorDetailPanelProps {
  item: MediaItem | null;
  activeTab: MediaTab;
  onEdit?: (item: MediaItem) => void;
  onToggleStatus?: (item: MediaItem, field: "inPlex" | "digitalCopy" | "wishlist") => void;
  onSearchArtwork?: (item: MediaItem) => void;
}

export function CollectorDetailPanel({
  item,
  activeTab,
  onEdit,
  onToggleStatus,
  onSearchArtwork,
}: CollectorDetailPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<"details" | "tracks" | "personal">("details");

  if (!item) {
    return (
      <aside className="w-80 md:w-96 shrink-0 bg-card/40 border-l border-border/60 flex flex-col items-center justify-center p-8 text-center text-muted-foreground select-none h-full">
        <Disc className="w-12 h-12 text-muted-foreground/30 mb-3" />
        <p className="text-sm font-medium text-foreground/80">No Item Selected</p>
        <p className="text-xs text-muted-foreground mt-1">
          Select an item from the collection grid to view full details, tracks, and artwork.
        </p>
      </aside>
    );
  }

  const isMusic = activeTab === "cds" || activeTab === "music";
  const isVideo = activeTab === "movies" || activeTab === "tv";
  const isGame = activeTab === "games";

  const artist = item.artist || (item.metadata as any)?.artist || "";
  const genre = item.genre || (item.metadata as any)?.genre || "";
  const label = (item.metadata as any)?.label || (item.metadata as any)?.record_label || "";
  const format = item.format || (item.formats && item.formats[0]) || "";
  const country = (item.metadata as any)?.["country (cleaned)"] || (item.metadata as any)?.country || "USA";
  const location = (item.metadata as any)?.location || (item.metadata as any)?.slot || (item.notes?.includes("CDs") ? item.notes : "Main Collection");
  const packaging = (item.metadata as any)?.packaging || (item.notes?.toLowerCase().includes("digipak") ? "Digipak" : "Jewel Case");
  const tracksList: Array<{ no: number; title: string; duration?: string }> =
    (item.metadata as any)?.tracks_list ||
    (item.metadata as any)?.tracks_data ||
    [];

  const overview = (item.metadata as any)?.overview || (item.metadata as any)?.plot || "";
  const runtime = (item.metadata as any)?.runtime || (item.metadata as any)?.duration || "";
  const castList: Array<{ name: string; character?: string; profile_url?: string }> =
    (item.metadata as any)?.cast || [];
  const crewObj: { director?: string[]; writer?: string[]; producer?: string[] } =
    (item.metadata as any)?.crew || {};
  const discsList: Array<{ label?: string; format?: string; condition?: string }> =
    (item.metadata as any)?.discs || [];
  const developer = (item.metadata as any)?.developer || "";
  const publisher = (item.metadata as any)?.publisher || "";

  return (
    <aside className="w-80 md:w-96 lg:w-[440px] shrink-0 bg-card/50 border-l border-border/60 flex flex-col h-full overflow-hidden select-none">
      {/* Top Header / Action Ribbon */}
      <div className="p-3 border-b border-border/50 bg-secondary/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 truncate">
          <span className="text-xs font-semibold text-foreground truncate">
            {item.title}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onSearchArtwork && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              title="Search Artwork"
              onClick={() => onSearchArtwork(item)}
            >
              <Image className="w-3.5 h-3.5" />
            </Button>
          )}
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              title="Edit Item"
              onClick={() => onEdit(item)}
            >
              <Edit3 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 scrollbar-thin">
        {/* Hero Artwork & Header Info */}
        <div className="flex gap-4 items-start">
          {/* Cover Art Box */}
          <div className="shrink-0 relative group">
            <div
              className={cn(
                "rounded-md overflow-hidden bg-secondary border border-border shadow-md transition-transform",
                isMusic
                  ? "w-28 h-28 sm:w-32 sm:h-32"
                  : isGame
                  ? "w-28 h-36 sm:w-32 sm:h-40"
                  : "w-28 h-40 sm:w-32 sm:h-44"
              )}
            >
              {item.posterUrl ? (
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-2 text-center">
                  {isMusic ? (
                    <Disc className="w-8 h-8 opacity-30 mb-1" />
                  ) : isGame ? (
                    <Gamepad2 className="w-8 h-8 opacity-30 mb-1" />
                  ) : (
                    <Film className="w-8 h-8 opacity-30 mb-1" />
                  )}
                  <span className="text-[10px]">No Artwork</span>
                </div>
              )}
            </div>
          </div>

          {/* Title / Artist / Format Badges */}
          <div className="flex-1 min-w-0 space-y-1">
            {artist && (
              <p className="text-xs font-bold text-amber-400 truncate tracking-wide uppercase">
                {artist}
              </p>
            )}
            <h2 className="text-sm sm:text-base font-bold text-foreground leading-tight line-clamp-2">
              {item.title}
            </h2>

            {/* Tags Row */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
              {item.year && (
                <span className="font-mono bg-secondary/80 px-1.5 py-0.5 rounded text-foreground">
                  {item.year}
                </span>
              )}
              {format && (
                <span className="font-mono font-medium bg-primary/20 text-primary px-1.5 py-0.5 rounded border border-primary/30">
                  {format}
                </span>
              )}
              {runtime && (
                <span className="font-mono bg-secondary/60 px-1.5 py-0.5 rounded">
                  {runtime} mins
                </span>
              )}
              {genre && (
                <span className="bg-secondary/60 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                  {genre}
                </span>
              )}
            </div>

            {/* Quick Status Buttons */}
            <div className="flex items-center gap-1.5 pt-2">
              <button
                onClick={() => onToggleStatus && onToggleStatus(item, "inPlex")}
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition-colors border",
                  item.inPlex
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary/60 text-muted-foreground border-border/60 hover:text-foreground"
                )}
                title={isMusic ? "Mark Listened" : "Mark Watched"}
              >
                <Check className="w-3 h-3" />
                <span>{isMusic ? "Listened" : "Watched"}</span>
              </button>

              <div className="flex items-center gap-0.5 px-2 py-1 rounded text-[10px] font-semibold bg-secondary/60 text-amber-400 border border-border/60">
                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                <span>{item.rating || 0}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Game Collector Condition Bar */}
        {isGame && (
          <div className="grid grid-cols-3 gap-1 bg-secondary/30 p-1 rounded-lg border border-border/40 text-center text-xs font-semibold">
            <div className="py-1 px-2 rounded bg-secondary/60 text-muted-foreground">
              Loose
            </div>
            <div className="py-1 px-2 rounded bg-primary/20 text-primary border border-primary/40 font-bold">
              CIB (Complete)
            </div>
            <div className="py-1 px-2 rounded bg-secondary/60 text-muted-foreground">
              New / Sealed
            </div>
          </div>
        )}

        {/* Navigation Sub-Tabs */}
        <div className="flex border-b border-border/60">
          <button
            onClick={() => setActiveSubTab("details")}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold transition-colors border-b-2",
              activeSubTab === "details"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {isVideo ? "Plot & Details" : "Details"}
          </button>
          {isMusic && (
            <button
              onClick={() => setActiveSubTab("tracks")}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold transition-colors border-b-2",
                activeSubTab === "tracks"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              Tracks
            </button>
          )}
          <button
            onClick={() => setActiveSubTab("personal")}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold transition-colors border-b-2",
              activeSubTab === "personal"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Personal
          </button>
        </div>

        {/* Tab Content: Details */}
        {activeSubTab === "details" && (
          <div className="space-y-3 text-xs">
            {/* Movie Plot */}
            {isVideo && overview && (
              <div className="space-y-1 bg-secondary/20 p-2.5 rounded-lg border border-border/40">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                  Plot Synopsis
                </span>
                <p className="text-foreground/90 leading-relaxed text-[11px]">
                  {overview}
                </p>
              </div>
            )}

            {/* Movie Cast */}
            {isVideo && castList.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                  Cast ({castList.length})
                </span>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                  {castList.slice(0, 12).map((actor, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-1.5 rounded bg-secondary/20 border border-border/30"
                    >
                      {actor.profile_url ? (
                        <img
                          src={actor.profile_url}
                          alt=""
                          className="w-7 h-9 object-cover rounded shrink-0 bg-secondary"
                        />
                      ) : (
                        <div className="w-7 h-9 bg-secondary rounded flex items-center justify-center text-[9px] text-muted-foreground shrink-0">
                          Actor
                        </div>
                      )}
                      <div className="truncate min-w-0">
                        <span className="font-semibold text-foreground truncate block text-[11px]">
                          {actor.name}
                        </span>
                        {actor.character && (
                          <span className="text-[10px] text-muted-foreground truncate block">
                            {actor.character}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Crew (Director / Writer) */}
            {isVideo && (crewObj.director || crewObj.writer) && (
              <div className="grid grid-cols-2 gap-2 bg-secondary/20 p-2.5 rounded-lg border border-border/40">
                {crewObj.director && (
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                      Director
                    </span>
                    <span className="text-foreground font-medium truncate block">
                      {crewObj.director.join(", ")}
                    </span>
                  </div>
                )}
                {crewObj.writer && (
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                      Writer
                    </span>
                    <span className="text-foreground font-medium truncate block">
                      {crewObj.writer.join(", ")}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Game Developer / Publisher */}
            {isGame && (developer || publisher) && (
              <div className="grid grid-cols-2 gap-2 bg-secondary/20 p-2.5 rounded-lg border border-border/40">
                {developer && (
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                      Developer
                    </span>
                    <span className="text-foreground font-medium truncate block">{developer}</span>
                  </div>
                )}
                {publisher && (
                  <div>
                    <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                      Publisher
                    </span>
                    <span className="text-foreground font-medium truncate block">{publisher}</span>
                  </div>
                )}
              </div>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-2 bg-secondary/20 p-2.5 rounded-lg border border-border/40">
              {label && (
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                    Record Label / Studio
                  </span>
                  <span className="text-foreground truncate block font-medium">{label}</span>
                </div>
              )}
              {country && (
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                    Country / Release
                  </span>
                  <span className="text-foreground truncate block font-medium">{country}</span>
                </div>
              )}
              {item.barcode && (
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                    Barcode
                  </span>
                  <span className="text-foreground font-mono text-[11px] block">{item.barcode}</span>
                </div>
              )}
              {item.totalCopies && item.totalCopies > 1 && (
                <div>
                  <span className="text-[10px] uppercase text-muted-foreground font-semibold block">
                    Copies
                  </span>
                  <span className="text-foreground font-medium block">{item.totalCopies} Discs</span>
                </div>
              )}
            </div>

            {/* Discs Breakdown */}
            {discsList.length > 0 && (
              <div className="space-y-1 bg-secondary/20 p-2.5 rounded-lg border border-border/40">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold block mb-1">
                  Discs in Edition ({discsList.length})
                </span>
                <div className="space-y-1">
                  {discsList.map((disc, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <span className="text-foreground font-medium">{disc.label || `Disc ${idx + 1}`}</span>
                      <span className="text-muted-foreground font-mono text-[10px] bg-secondary px-1 rounded">{disc.format || "Disc"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes / Description */}
            {item.notes && (
              <div className="bg-secondary/20 p-2.5 rounded-lg border border-border/40">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold block mb-1">
                  Collection Notes
                </span>
                <p className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                  {item.notes}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Tracks (Music) */}
        {activeSubTab === "tracks" && isMusic && (
          <div className="space-y-1.5 text-xs">
            {tracksList.length > 0 ? (
              <div className="divide-y divide-border/30 bg-secondary/20 rounded-lg border border-border/40 overflow-hidden">
                {tracksList.map((t, idx) => (
                  <div key={idx} className="flex items-center justify-between px-3 py-1.5 hover:bg-secondary/60">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-[10px] font-mono text-muted-foreground w-4 text-right">
                        {t.no || idx + 1}
                      </span>
                      <span className="text-foreground truncate">{t.title}</span>
                    </div>
                    {t.duration && (
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0 ml-2">
                        {t.duration}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground bg-secondary/20 rounded-lg border border-border/40">
                <Disc className="w-6 h-6 mx-auto opacity-40 mb-1.5" />
                <p>Track listing not yet populated</p>
              </div>
            )}
          </div>
        )}

        {/* Tab Content: Personal */}
        {activeSubTab === "personal" && (
          <div className="space-y-3 text-xs">
            <div className="space-y-2 bg-secondary/20 p-3 rounded-lg border border-border/40">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-primary" />
                  <span>Location:</span>
                </span>
                <span className="font-semibold text-foreground">{location}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5 text-primary" />
                  <span>Packaging:</span>
                </span>
                <span className="font-semibold text-foreground">{packaging}</span>
              </div>
            </div>

            {item.digitalCopy && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
                Digital copy included
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
