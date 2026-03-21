import { useMemo } from "react";
import { motion } from "framer-motion";
import { Disc, Monitor, Download, CalendarDays, Music, BookOpen, Gamepad2 } from "lucide-react";
import { DbMediaItem } from "@/hooks/useMediaItems";
import { MediaTab } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CollectionStatsProps {
  items: DbMediaItem[];
  isLoading: boolean;
  activeTab: MediaTab;
  onStatsClick?: (type: string) => void;
  activeStatusFilter?: string | null;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

interface StatCard {
  id: string;
  icon: typeof Disc;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
  bg: string;
  clickable: boolean;
}

function countByFormat(items: DbMediaItem[], keywords: string[]): number {
  return items.filter((item) => {
    const formats = item.formats ?? (item.format ? [item.format] : []);
    return formats.some((f) =>
      keywords.some((kw) => f.toLowerCase().includes(kw.toLowerCase()))
    );
  }).length;
}

function countByMetaField(items: DbMediaItem[], field: string, keywords: string[]): number {
  return items.filter((item) => {
    const meta = item.metadata as Record<string, any> | null;
    if (!meta) return false;
    const val = meta[field];
    if (typeof val === "string") {
      return keywords.some((kw) => val.toLowerCase().includes(kw.toLowerCase()));
    }
    if (Array.isArray(val)) {
      return val.some((v: string) =>
        keywords.some((kw) => v.toLowerCase().includes(kw.toLowerCase()))
      );
    }
    return false;
  }).length;
}

function buildMovieCards(items: DbMediaItem[]): StatCard[] {
  const total = items.length;
  const plexCount = items.filter((i) => i.in_plex).length;
  const digitalCount = items.filter((i) => i.digital_copy).length;
  const dates = items.map((i) => new Date(i.created_at).getTime());
  const lastImport = dates.length > 0 ? new Date(Math.max(...dates)) : null;

  const fmtPct = (count: number) => {
    if (total === 0) return "0%";
    const pct = (count / total) * 100;
    if (pct > 0 && pct < 1) return "<1%";
    return `${Math.round(pct)}%`;
  };

  return [
    { id: "total", icon: Disc, label: "Total Items", value: total.toLocaleString(), color: "text-primary", bg: "bg-primary/10", clickable: true },
    { id: "plex", icon: Monitor, label: "Ripped to Plex", value: fmtPct(plexCount), subtitle: `${plexCount} titles`, color: "text-primary", bg: "bg-primary/10", clickable: true },
    { id: "digital", icon: Download, label: "Digital Owned", value: fmtPct(digitalCount), subtitle: `${digitalCount} titles`, color: "text-accent", bg: "bg-accent/10", clickable: true },
    {
      id: "import", icon: CalendarDays, label: "Last Import",
      value: lastImport ? lastImport.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
      color: "text-muted-foreground", bg: "bg-secondary", clickable: false,
    },
  ];
}

function buildCDCards(items: DbMediaItem[]): StatCard[] {
  const total = items.length;
  const cdCount = countByFormat(items, ["cd", "promo"]);
  const vinylCount = countByFormat(items, ["vinyl"]);
  const cassetteCount = countByFormat(items, ["cassette"]);
  const digitalCount = countByFormat(items, ["digital"]);

  // Pick top 3 non-zero format counts for display
  const formatCards: StatCard[] = [];
  const formats: { id: string; label: string; count: number; icon: typeof Disc }[] = [
    { id: "cd", label: "CDs", count: cdCount, icon: Disc },
    { id: "vinyl", label: "Vinyl", count: vinylCount, icon: Music },
    { id: "cassette", label: "Cassettes", count: cassetteCount, icon: Music },
    { id: "digital", label: "Digital", count: digitalCount, icon: Download },
  ];

  // Always show formats even if 0
  const topFormats = formats.sort((a, b) => b.count - a.count).slice(0, 3);
  topFormats.forEach((f) => {
    formatCards.push({
      id: f.id, icon: f.icon, label: f.label,
      value: f.count.toLocaleString(),
      color: "text-primary", bg: "bg-primary/10", clickable: true,
    });
  });

  return [
    { id: "total", icon: Disc, label: "Total Items", value: total.toLocaleString(), color: "text-primary", bg: "bg-primary/10", clickable: true },
    ...formatCards,
  ];
}

// Books tab removed — no buildBookCards needed

function buildGameCards(items: DbMediaItem[]): StatCard[] {
  const total = items.length;

  // Check both format field and metadata.platforms
  const countPlatform = (keywords: string[]) => {
    return items.filter((item) => {
      const formats = item.formats ?? (item.format ? [item.format] : []);
      const meta = item.metadata as Record<string, any> | null;
      const platforms = meta?.platforms as string[] | undefined;
      const allVals = [...formats, ...(platforms ?? [])];
      return allVals.some((v) =>
        keywords.some((kw) => v.toLowerCase().includes(kw.toLowerCase()))
      );
    }).length;
  };

  const platformDefs: { id: string; label: string; keywords: string[] }[] = [
    { id: "playstation", label: "PlayStation", keywords: ["ps5", "ps4", "ps3", "ps2", "ps1", "psx", "playstation", "vita", "psp"] },
    { id: "xbox", label: "Xbox", keywords: ["xbox", "xb1", "xsx", "360"] },
    { id: "nintendo", label: "Nintendo", keywords: ["switch", "wii", "gamecube", "n64", "snes", "nes", "3ds", "ds", "game boy", "gameboy", "nintendo"] },
    { id: "pc", label: "PC / Steam", keywords: ["pc", "steam", "windows", "mac", "linux"] },
    { id: "atari", label: "Atari", keywords: ["atari"] },
    { id: "sega", label: "Sega", keywords: ["sega", "genesis", "dreamcast", "saturn", "mega drive"] },
    { id: "digital", label: "Digital", keywords: ["digital"] },
  ];

  const withCounts = platformDefs.map((p) => ({ ...p, count: countPlatform(p.keywords) }));
  const topPlatforms = withCounts.sort((a, b) => b.count - a.count).slice(0, 3);

  return [
    { id: "total", icon: Gamepad2, label: "Total Items", value: total.toLocaleString(), color: "text-primary", bg: "bg-primary/10", clickable: true },
    ...topPlatforms.map((p) => ({
      id: p.id, icon: Gamepad2 as typeof Disc, label: p.label,
      value: p.count.toLocaleString(),
      color: "text-primary", bg: "bg-primary/10", clickable: true,
    })),
  ];
}

export function CollectionStats({ items, isLoading, activeTab, onStatsClick, activeStatusFilter }: CollectionStatsProps) {
  const cards = useMemo(() => {
    if (!items || items.length === 0) {
      // Return empty state cards based on tab
      const emptyTotal: StatCard = { id: "total", icon: Disc, label: "Total Items", value: "0", color: "text-primary", bg: "bg-primary/10", clickable: false };
      return [emptyTotal];
    }

    switch (activeTab) {
      case "movies":
      case "music-films":
        return buildMovieCards(items);
      case "cds":
        return buildCDCards(items);
      case "games":
        return buildGameCards(items);
      default:
        return buildMovieCards(items);
    }
  }, [items, activeTab]);

  if (isLoading) return null;

  return (
    <motion.div
      className="px-4 py-6 max-w-3xl mx-auto"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.p variants={cardVariants} className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-4">
        Collection Stats
      </motion.p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((card) => {
          const isActive = card.id === "total"
            ? !activeStatusFilter
            : (card.clickable && activeStatusFilter === card.id);
          return (
            <motion.div
              key={card.id}
              variants={cardVariants}
              onClick={card.clickable && onStatsClick ? () => onStatsClick(card.id) : undefined}
              className={cn(
                "relative rounded-xl p-4 border border-border/50 bg-card/40 backdrop-blur-md transition-all duration-200",
                card.clickable && "cursor-pointer hover:bg-card/60 hover:border-primary/30",
                isActive && "border-primary/60 bg-primary/10 ring-1 ring-primary/30"
              )}
            >
              <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
              <p className="text-xl font-bold text-foreground">{card.value}</p>
              <p className="text-[11px] text-muted-foreground mt-1">{card.label}</p>
              {card.subtitle && (
                <p className="text-[10px] text-muted-foreground/80 mt-0.5">{card.subtitle}</p>
              )}
              {card.clickable && (
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  {isActive ? "Click to clear filter" : "Click to filter"}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
