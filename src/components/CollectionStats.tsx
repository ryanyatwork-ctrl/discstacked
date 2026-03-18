import { useMemo } from "react";
import { motion } from "framer-motion";
import { Disc, Monitor, Download, CalendarDays } from "lucide-react";
import { DbMediaItem } from "@/hooks/useMediaItems";

interface CollectionStatsProps {
  items: DbMediaItem[];
  isLoading: boolean;
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export function CollectionStats({ items, isLoading }: CollectionStatsProps) {
  const stats = useMemo(() => {
    if (!items || items.length === 0) {
      return { total: 0, plexPct: 0, digitalPct: 0, lastImport: null };
    }

    const total = items.length;
    const inPlex = items.filter((i) => i.in_plex).length;
    const digital = items.filter((i) => i.digital_copy).length;

    const dates = items.map((i) => new Date(i.created_at).getTime());
    const lastImport = new Date(Math.max(...dates));

    return {
      total,
      plexPct: total > 0 ? Math.round((inPlex / total) * 100) : 0,
      digitalPct: total > 0 ? Math.round((digital / total) * 100) : 0,
      lastImport,
    };
  }, [items]);

  if (isLoading) return null;

  const cards = [
    {
      icon: Disc,
      label: "Total Items",
      value: stats.total.toLocaleString(),
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Monitor,
      label: "Ripped to Plex",
      value: `${stats.plexPct}%`,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: Download,
      label: "Digital Owned",
      value: `${stats.digitalPct}%`,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      icon: CalendarDays,
      label: "Last Import",
      value: stats.lastImport
        ? stats.lastImport.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "—",
      color: "text-muted-foreground",
      bg: "bg-secondary",
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
        {cards.map((card) => (
          <motion.div
            key={card.label}
            variants={cardVariants}
            className="relative rounded-xl p-4 border border-border/50 bg-card/40 backdrop-blur-md"
          >
            <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-3`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className="text-xl font-bold text-foreground">{card.value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{card.label}</p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
