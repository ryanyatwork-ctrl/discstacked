import { TABS, MediaTab } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MobileTabBarProps {
  activeTab: MediaTab;
  onTabChange: (tab: MediaTab) => void;
}

export function MobileTabBar({ activeTab, onTabChange }: MobileTabBarProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card/95 backdrop-blur-md border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors duration-150 min-w-0",
              activeTab === tab.id
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-[10px] font-medium truncate">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
