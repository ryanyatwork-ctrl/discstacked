import { useMemo } from "react";
import { motion } from "framer-motion";
import { Disc, Monitor, Download, CalendarDays } from "lucide-react";
import { DbMediaItem } from "@/hooks/useMediaItems";
import { cn } from "@/lib/utils";

interface CollectionStatsProps {
  items: DbMediaItem[];
  isLoading: boolean;
  onStatsClick?: (type: "plex" | "digital" | "total") => void;
  activeStatusFilter?: "plex" | "digital" | null;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export function CollectionStats({ items, isLoading, onStatsClick, activeStatusFilter }: CollectionStatsProps) {
  const stats = useMemo(() => {
    if (!items || items.length === 0) {
      return { total: 0, plexPct: 0, digitalPct: 0, plexCount: 0, digitalCount: 0, lastImport: null };
    }

    const total = items.length;
    const plexCount = items.filter((i) => i.in_plex).length;
    const digitalCount = items.filter((i) => i.digital_copy).length;

    const dates = items.map((i) => new Date(i.created_at).getTime());
    const lastImport = new Date(Math.max(...dates));

    return {
      total,
      plexPct: total > 0 ? Math.round((plexCount / total) * 100) : 0,
      digitalPct: total > 0 ? Math.round((digitalCount / total) * 100) : 0,
      plexCount,
      digitalCount,
      lastImport,
    };
  }, [items]);

  if (isLoading) return null;

  const fmtPct = (count: number, total: number) => {
    if (total === 0) return "0%";
    const pct = (count / total) * 100;
    if (pct > 0 && pct < 1) return "<1%";
    return `${Math.round(pct)}%`;
  };

  const cards = [
    {
      id: "total" as const,
      icon: Disc,
      label: "Total Items",
      value: stats.total.toLocaleString(),
      color: "text-primary",
      bg: "bg-primary/10",
      clickable: true,
    },
    {
      id: "plex" as const,
      icon: Monitor,
      label: "Ripped to Plex",
      value: fmtPct(stats.plexCount, stats.total),
      subtitle: `${stats.plexCount} titles`,
      color: "text-primary",
      bg: "bg-primary/10",
      clickable: true,
    },
    {
      id: "digital" as const,
      icon: Download,
      label: "Digital Owned",
      value: fmtPct(stats.digitalCount, stats.total),
      subtitle: `${stats.digitalCount} titles`,
      color: "text-accent",
      bg: "bg-accent/10",
      clickable: true,
    },
    {
      id: "import" as const,
      icon: CalendarDays,
      label: "Last Import",
      value: stats.lastImport
        ? stats.lastImport.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "—",
      color: "text-muted-foreground",
      bg: "bg-secondary",
      clickable: false,
    },
  ];

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
          const isActive = card.id === "total" ? !activeStatusFilter : (card.clickable && activeStatusFilter === card.id);
          return (
            <motion.div
              key={card.label}
              variants={cardVariants}
              onClick={card.clickable && onStatsClick ? () => onStatsClick(card.id as "plex" | "digital" | "total") : undefined}
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
