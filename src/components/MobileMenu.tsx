import { Menu, Settings, User, Users, Download } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function MobileMenu() {
  const handleComingSoon = (label: string) => {
    toast({ title: "Coming soon", description: `${label} is not yet available. Sign in required.` });
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden text-muted-foreground hover:text-foreground">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-card border-border">
        <SheetHeader>
          <SheetTitle className="text-foreground text-left">DiscStacked</SheetTitle>
        </SheetHeader>
        <nav className="mt-6 space-y-1">
          <MenuLink icon={User} label="Profile" onClick={() => handleComingSoon("Profile")} />
          <MenuLink icon={Users} label="Friends" onClick={() => handleComingSoon("Friends")} />
          <MenuLink icon={Download} label="Download for Offline" onClick={() => handleComingSoon("Download for Offline")} />
          <MenuLink icon={Settings} label="Settings" onClick={() => handleComingSoon("Settings")} />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MenuLink({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}