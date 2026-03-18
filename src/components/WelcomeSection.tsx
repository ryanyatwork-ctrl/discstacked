import { motion } from "framer-motion";
import { Search, Disc, Monitor, ShoppingCart } from "lucide-react";
import logo from "@/assets/DiscStacked_Logo.png";

const features = [
  {
    icon: Search,
    title: "Quick Search",
    description: "Use the A-Z jump-links or the global search bar to find any title instantly.",
  },
  {
    icon: Disc,
    title: "Format Identification",
    description: "Look for the Blue (Blu-ray), Gold (4K), or Gray (DVD) badges to see what's on the shelf.",
  },
  {
    icon: Monitor,
    title: "Digital Status",
    description: "If you see the Plex or Cloud icon, a digital copy is available for streaming.",
  },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export function WelcomeSection() {
  return (
    <motion.div
      className="px-4 py-8 max-w-3xl mx-auto space-y-10"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Hero */}
      <motion.div variants={itemVariants} className="flex flex-col items-center text-center gap-6">
        <div className="relative">
          <div className="absolute -inset-8 rounded-3xl bg-primary/15 blur-3xl" />
          <img src={logo} alt="DiscStacked" className="relative w-48 sm:w-56 rounded-2xl drop-shadow-[0_0_35px_hsl(43_88%_47%/0.35)]" />
        </div>
        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Welcome to <span className="text-primary">DiscStacked</span>
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg leading-relaxed">
            Browse my collection of 2,400+ movies, music films, and CDs. Check formats, digital availability, and find your next watch.
          </p>
        </div>
      </motion.div>

      {/* Feature Guide */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="relative group rounded-xl p-5 border border-border/50 bg-card/40 backdrop-blur-md hover:bg-card/60 transition-colors duration-200"
          >
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
            <div className="relative space-y-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Amazon Callout */}
      <motion.div variants={itemVariants}>
        <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 backdrop-blur-md p-4">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
            <ShoppingCart className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Find on Amazon</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              See something you like? Click the "Find on Amazon" button on any title to grab your own copy.
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
