import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Moon, Sun, LayoutGrid, List, Film, Tv, Music, Gamepad2, BookOpen, Save, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { TABS } from "@/lib/types";

type Theme = "dark" | "light";
type ViewMode = "covers" | "list";
type DefaultTab = "movies" | "tv" | "music" | "games" | "books";

function getStoredSetting<T>(key: string, fallback: T): T {
  try {
    const val = localStorage.getItem(key);
    return val ? (JSON.parse(val) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setSetting<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const { profile, updateProfile } = useProfile();

  const [theme, setTheme] = useState<Theme>(() => getStoredSetting("ds-theme", "dark"));
  const [defaultView, setDefaultView] = useState<ViewMode>(() => getStoredSetting("ds-default-view", "covers"));
  const [defaultTab, setDefaultTab] = useState<DefaultTab>(() => getStoredSetting("ds-default-tab", "movies"));

  // Shared tabs state
  const [sharedTabs, setSharedTabs] = useState<string[]>([]);
  useEffect(() => {
    if (profile?.shared_tabs) {
      setSharedTabs(profile.shared_tabs);
    }
  }, [profile]);

  const handleSharedTabToggle = async (tabId: string, checked: boolean) => {
    const next = checked ? [...sharedTabs, tabId] : sharedTabs.filter((t) => t !== tabId);
    setSharedTabs(next);
    try {
      await updateProfile.mutateAsync({ shared_tabs: next } as any);
      toast({ title: checked ? `${tabId} collection shared` : `${tabId} collection hidden` });
    } catch {
      setSharedTabs(sharedTabs); // revert
      toast({ title: "Failed to update", variant: "destructive" });
    }
  };

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const handleThemeToggle = (checked: boolean) => {
    const newTheme: Theme = checked ? "dark" : "light";
    setTheme(newTheme);
    setSetting("ds-theme", newTheme);
    if (newTheme === "dark") {
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
    }
    toast({ title: `Theme set to ${newTheme} mode` });
  };

  const handleViewChange = (view: ViewMode) => {
    setDefaultView(view);
    setSetting("ds-default-view", view);
    toast({ title: `Default view set to ${view}` });
  };

  const handleTabChange = (tab: string) => {
    setDefaultTab(tab as DefaultTab);
    setSetting("ds-default-tab", tab);
  };

  const handlePasswordChange = async () => {
    if (newPassword.length < 6) {
      toast({ title: "Password too short", description: "Minimum 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Password updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  if (!user) {
    navigate("/auth");
    return null;
  }

  const tabIcons = { movies: Film, tv: Tv, music: Music, games: Gamepad2, books: BookOpen };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        </div>
      </header>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        {/* Theme */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Appearance</h2>
          <div className="flex items-center justify-between p-3 rounded-lg bg-card">
            <div className="flex items-center gap-3">
              {theme === "dark" ? <Moon className="h-4 w-4 text-muted-foreground" /> : <Sun className="h-4 w-4 text-muted-foreground" />}
              <span className="text-sm text-foreground">Dark Mode</span>
            </div>
            <Switch checked={theme === "dark"} onCheckedChange={handleThemeToggle} />
          </div>
        </section>

        {/* Default View */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Default View</h2>
          <div className="flex gap-2">
            <Button
              variant={defaultView === "covers" ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-2"
              onClick={() => handleViewChange("covers")}
            >
              <LayoutGrid className="h-4 w-4" />
              Covers
            </Button>
            <Button
              variant={defaultView === "list" ? "default" : "outline"}
              size="sm"
              className="flex-1 gap-2"
              onClick={() => handleViewChange("list")}
            >
              <List className="h-4 w-4" />
              List
            </Button>
          </div>
        </section>

        {/* Default Tab */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Default Tab</h2>
          <Select value={defaultTab} onValueChange={handleTabChange}>
            <SelectTrigger className="bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(tabIcons).map(([key, Icon]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="capitalize">{key}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {/* Shared Collections */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Share2 className="h-4 w-4" />
            Shared Collections
          </h2>
          <p className="text-xs text-muted-foreground">Choose which collections are visible when you share your link with friends.</p>
          <div className="space-y-1">
            {TABS.map((tab) => (
              <div key={tab.id} className="flex items-center justify-between p-3 rounded-lg bg-card">
                <div className="flex items-center gap-3">
                  <span className="text-base">{tab.icon}</span>
                  <span className="text-sm text-foreground">{tab.label}</span>
                </div>
                <Switch
                  checked={sharedTabs.includes(tab.id)}
                  onCheckedChange={(checked) => handleSharedTabToggle(tab.id, checked)}
                />
              </div>
            ))}
          </div>
        </section>

        {/* Change Password */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">Account</h2>
          <div className="space-y-3 p-3 rounded-lg bg-card">
            <Input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button
              onClick={handlePasswordChange}
              disabled={!newPassword || changingPassword}
              size="sm"
              className="w-full gap-2"
            >
              <Save className="h-4 w-4" />
              {changingPassword ? "Updating..." : "Change Password"}
            </Button>
          </div>
        </section>

        {/* Sign Out */}
        <section>
          <Button
            variant="outline"
            className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            Sign Out
          </Button>
        </section>
      </div>
    </div>
  );
}
