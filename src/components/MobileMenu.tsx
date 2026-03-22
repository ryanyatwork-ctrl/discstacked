import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, Settings, User, Users, Download, Upload, Shuffle, ImageIcon, LogOut, Share2, Mail } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { exportAsCSV, exportAsJSON } from "@/lib/export-utils";
import { DbMediaItem } from "@/hooks/useMediaItems";

interface MobileMenuProps {
  onImport?: () => void;
  onRandomize?: () => void;
  onFetchArtwork?: () => void;
  onSignOut?: () => void;
  isLoggedIn?: boolean;
  allItems?: DbMediaItem[];
}

export function MobileMenu({ onImport, onRandomize, onFetchArtwork, onSignOut, isLoggedIn, allItems }: MobileMenuProps) {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [exportOpen, setExportOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleShare = () => {
    if (!profile?.share_token) {
      toast({ title: "Error", description: "Share token not available", variant: "destructive" });
      return;
    }
    const url = `${window.location.origin}/share/${profile.share_token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied!", description: "Share this link so others can view your collection." });
  };

  const handleExport = (format: "csv" | "json") => {
    if (!allItems || allItems.length === 0) {
      toast({ title: "Nothing to export", description: "Your collection is empty." });
      return;
    }
    if (format === "csv") exportAsCSV(allItems);
    else exportAsJSON(allItems);
    setExportOpen(false);
    toast({ title: `Exported as ${format.toUpperCase()}` });
  };

  return (
    <>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-card border-border">
          <SheetHeader>
            <SheetTitle className="text-foreground text-left">DiscStacked</SheetTitle>
          </SheetHeader>
          <nav className="mt-6 space-y-1">
            {isLoggedIn && (
              <>
                {onFetchArtwork && (
                  <MenuLink icon={ImageIcon} label="Fetch Artwork" onClick={() => { setSheetOpen(false); onFetchArtwork(); }} />
                )}
                {onRandomize && (
                  <MenuLink icon={Shuffle} label="Randomizer" onClick={() => { setSheetOpen(false); onRandomize(); }} />
                )}
                {onImport && (
                  <MenuLink icon={Upload} label="Import Collection" onClick={() => { setSheetOpen(false); onImport(); }} />
                )}
                <MenuLink icon={Share2} label="Share Collection" onClick={() => { setSheetOpen(false); handleShare(); }} />
                <div className="my-3 border-t border-border" />
              </>
            )}
            {isLoggedIn && (
              <MenuLink icon={User} label="Profile" onClick={() => { setSheetOpen(false); navigate("/profile"); }} />
            )}
            <MenuLink icon={Download} label="Export Collection" onClick={() => { setSheetOpen(false); setExportOpen(true); }} />
            <MenuLink icon={Settings} label="Settings" onClick={() => { setSheetOpen(false); navigate("/settings"); }} />
            {isLoggedIn && onSignOut && (
              <>
                <div className="my-3 border-t border-border" />
                <MenuLink icon={LogOut} label="Sign Out" onClick={() => { setSheetOpen(false); onSignOut(); }} />
              </>
            )}
          </nav>
        </SheetContent>
      </Sheet>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Export Collection</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button variant="outline" onClick={() => handleExport("csv")} className="justify-start gap-2">
              <Download className="h-4 w-4" />
              Download as CSV
            </Button>
            <Button variant="outline" onClick={() => handleExport("json")} className="justify-start gap-2">
              <Download className="h-4 w-4" />
              Download as JSON
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
