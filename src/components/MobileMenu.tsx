import { Menu, Settings, User, Users, Download } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function MobileMenu() {
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
          <MenuLink icon={User} label="Profile" />
          <MenuLink icon={Users} label="Friends" />
          <MenuLink icon={Download} label="Download for Offline" />
          <MenuLink icon={Settings} label="Settings" />
        </nav>
      </SheetContent>
    </Sheet>
  );
}

function MenuLink({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <button className="flex items-center gap-3 w-full px-3 py-2.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}
