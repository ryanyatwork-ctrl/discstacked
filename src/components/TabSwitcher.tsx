import { TABS, MediaTab } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TabSwitcherProps {
  activeTab: MediaTab;
  onTabChange: (tab: MediaTab) => void;
}

export function TabSwitcher({ activeTab, onTabChange }: TabSwitcherProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            "flex items-center gap-1.5 whitespace-nowrap px-4 py-2 text-sm font-medium rounded-md transition-colors duration-150",
            activeTab === tab.id
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
        >
          <span className="text-base">{tab.icon}</span>
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
