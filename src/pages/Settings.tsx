import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Moon, Sun, LayoutGrid, List, Film, Tv, Music, Gamepad2, BookOpen, Save, Share2, Eye, EyeOff, RefreshCw, Check, X, Disc, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { TABS } from "@/lib/types";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "Number", test: (p: string) => /\d/.test(p) },
  { label: "Special character", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

function getStrength(password: string) {
  const passed = PASSWORD_RULES.filter((r) => r.test(password)).length;
  if (passed <= 1) return { level: "Weak", color: "bg-destructive", pct: 20 };
  if (passed <= 2) return { level: "Fair", color: "bg-orange-500", pct: 40 };
  if (passed <= 3) return { level: "Good", color: "bg-yellow-500", pct: 60 };
  if (passed <= 4) return { level: "Strong", color: "bg-emerald-500", pct: 80 };
  return { level: "Very Strong", color: "bg-emerald-400", pct: 100 };
}

function generateStrongPassword(): string {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%&*?";
  const all = upper + lower + digits + special;
  const pw = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
  ];
  for (let i = pw.length; i < 16; i++) {
    pw.push(all[Math.floor(Math.random() * all.length)]);
  }
  for (let i = pw.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join("");
}

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
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const strength = useMemo(() => getStrength(newPassword), [newPassword]);

  const handleGeneratePassword = () => {
    const pw = generateStrongPassword();
    setNewPassword(pw);
    setConfirmPassword(pw);
    setShowNewPassword(true);
    setShowConfirmPassword(true);
    toast({ title: "Strong password generated", description: "Make sure to save it somewhere safe!" });
  };

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
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Minimum 8 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    const allPassed = PASSWORD_RULES.every((r) => r.test(newPassword));
    if (!allPassed) {
      toast({ title: "Password too weak", description: "Please meet all requirements", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      toast({ title: "Password updated successfully" });
    } catch (err: any) {
      console.error("Password update error:", err);
      toast({ title: "Error updating password", description: err.message, variant: "destructive" });
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
            <div className="relative">
              <Input
                type={showNewPassword ? "text" : "password"}
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {newPassword.length > 0 && (
              <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strength.color}`}
                      style={{ width: `${strength.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground font-medium min-w-[70px] text-right">
                    {strength.level}
                  </span>
                </div>
                <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                  {PASSWORD_RULES.map((rule) => {
                    const passed = rule.test(newPassword);
                    return (
                      <li key={rule.label} className="flex items-center gap-1.5 text-xs">
                        {passed ? (
                          <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                        ) : (
                          <X className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                        )}
                        <span className={passed ? "text-muted-foreground" : "text-muted-foreground/50"}>
                          {rule.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleGeneratePassword}
            >
              <RefreshCw className="h-4 w-4" />
              Suggest Strong Password
            </Button>

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
