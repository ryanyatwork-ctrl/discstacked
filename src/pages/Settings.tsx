import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Moon, Sun, LayoutGrid, List, Film, Tv, Music, Gamepad2, Save, Share2, Eye, EyeOff, RefreshCw, Check, X, Disc, Loader2, Database, Sparkles, Download, Upload } from "lucide-react";
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
type DefaultTab = "movies" | "tv" | "music" | "games";

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

  const tabIcons = { movies: Film, tv: Tv, music: Music, games: Gamepad2 };

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

        {/* Data Tools */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Disc className="h-4 w-4" />
            Data Tools
          </h2>
          <p className="text-xs text-muted-foreground">
            Auto-populate disc entries from your imported data. This uses your existing format and disc count information to create individual disc records without re-importing.
          </p>
          <BackfillDiscsButton userId={user.id} />
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">
              Re-fetch metadata for your existing collection. Movies use TMDB; CDs use Discogs/MusicBrainz; Games use IGDB/RAWG.
            </p>
            <BackfillTmdbButton userId={user.id} />
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">
              Generate AI cover art for items missing artwork. Uses the artist name and title to create unique album-style covers.
            </p>
            <GenerateAiCoversButton userId={user.id} />
          </div>
        </section>

        {/* VGG Import */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Upload className="h-4 w-4" />
            Import from VideoGameGeek
          </h2>
          <p className="text-xs text-muted-foreground">
            Enter your VideoGameGeek username to import your owned video game collection directly.
          </p>
          <VggImportButton userId={user.id} />
        </section>

        {/* Unstacked Export */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export for Unstacked
          </h2>
          <p className="text-xs text-muted-foreground">
            Export your collection in a format compatible with Unstacked for easy pricing, sale, and auction creation.
          </p>
          <UnstackedExportButton userId={user.id} />
        </section>

        {/* Support / Donate */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            ❤️ Support DiscStacked
          </h2>
          <p className="text-xs text-muted-foreground">
            If you enjoy using DiscStacked and want to show your support, consider buying us a coffee!
          </p>
          <div className="flex gap-2">
            <a
              href="https://paypal.me/yelltom"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="outline" size="sm" className="w-full gap-2">
                💙 PayPal
              </Button>
            </a>
            <a
              href="https://venmo.com/BellevilleSystems"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1"
            >
              <Button variant="outline" size="sm" className="w-full gap-2">
                💚 Venmo
              </Button>
            </a>
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

function BackfillDiscsButton({ userId }: { userId: string }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const handleBackfill = async () => {
    setRunning(true);
    setProgress("Fetching collection...");
    try {
      // Fetch all items for this user
      let allItems: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("media_items")
          .select("id, formats, metadata")
          .eq("user_id", userId)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allItems = allItems.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Filter to items that have formats but no discs in metadata
      const candidates = allItems.filter((item) => {
        const meta = item.metadata || {};
        const hasDiscs = meta.discs && Array.isArray(meta.discs) && meta.discs.length > 0;
        const hasFormats = item.formats && item.formats.length > 0;
        return hasFormats && !hasDiscs;
      });

      setProgress(`Found ${candidates.length} items to backfill...`);

      let updated = 0;
      for (let i = 0; i < candidates.length; i += 50) {
        const batch = candidates.slice(i, i + 50);
        const updates = batch.map((item) => {
          const meta = item.metadata || {};
          const discCount = parseInt(meta.disc_count || "0", 10) || item.formats.length;
          const formats: string[] = item.formats;

          // Create disc entries from formats
          const discs: { label: string; format: string; missing: boolean }[] = [];
          for (let d = 0; d < Math.max(discCount, formats.length); d++) {
            const fmt = formats[d] || formats[0] || "Blu-ray";
            discs.push({
              label: discCount > 1 ? `Disc ${d + 1}` : "Main Disc",
              format: fmt,
              missing: false,
            });
          }

          return {
            id: item.id,
            metadata: { ...meta, discs },
          };
        });

        for (const upd of updates) {
          const { error } = await supabase
            .from("media_items")
            .update({ metadata: upd.metadata })
            .eq("id", upd.id);
          if (error) console.error("Backfill error:", error);
          else updated++;
        }
        setProgress(`Updated ${Math.min(i + 50, candidates.length)} of ${candidates.length}...`);
      }

      toast({
        title: "Backfill complete!",
        description: `Auto-populated disc entries for ${updated} items.`,
      });
    } catch (err: any) {
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={handleBackfill}
        disabled={running}
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Disc className="h-4 w-4" />}
        {running ? "Backfilling..." : "Auto-Populate Disc Entries"}
      </Button>
      {progress && <p className="text-xs text-muted-foreground text-center">{progress}</p>}
      <p className="text-[11px] text-muted-foreground">
        Only affects items that don't already have disc entries. Won't overwrite any manual edits you've made.
      </p>
    </div>
  );
}

function BackfillTmdbButton({ userId }: { userId: string }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const handleBackfill = async () => {
    setRunning(true);
    setProgress("Fetching collection...");
    try {
      let allItems: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("media_items")
          .select("id, title, year, genre, metadata, media_type")
          .eq("user_id", userId)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allItems = allItems.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Filter to items missing enriched metadata
      const candidates = allItems.filter((item) => {
        const meta = item.metadata || {};
        const type = item.media_type;
        if (type === "movies" || type === "music-films") {
          return !meta.cast || !meta.crew || !meta.runtime;
        }
        if (type === "cds") return !meta.artist && !meta.tracklist;
        if (type === "games") return !meta.developer && !meta.platforms;
        return false;
      });

      setProgress(`Found ${candidates.length} items to update...`);
      let updated = 0;

      for (let i = 0; i < candidates.length; i++) {
        const item = candidates[i];
        const type = item.media_type;
        try {
          let lookupFn: string;
          let body: Record<string, any>;

          if (type === "movies" || type === "music-films") {
            lookupFn = "tmdb-lookup";
            body = { query: item.title, year: item.year, search_type: "movie" };
          } else if (type === "cds") {
            lookupFn = "music-lookup";
            body = { query: item.title };
          } else if (type === "games") {
            lookupFn = "game-lookup";
            body = { query: item.title };
          } else {
            continue;
          }

          const { data, error } = await supabase.functions.invoke(lookupFn, { body });
          if (error) throw error;

          const results = data?.results || [];
          if (results.length === 0) {
            setProgress(`${i + 1}/${candidates.length} — no match for "${item.title}"`);
            continue;
          }

          const top = results[0];
          const currentMeta = item.metadata || {};
          let updatedMeta = { ...currentMeta };
          const updatePayload: any = {};

          if (type === "movies" || type === "music-films") {
            // Get full details
            const { data: details } = await supabase.functions.invoke("tmdb-lookup", {
              body: { tmdb_id: top.tmdb_id, search_type: top.media_type || "movie" },
            });
            if (details) {
              updatedMeta = {
                ...updatedMeta,
                runtime: details.runtime || currentMeta.runtime,
                tagline: details.tagline || currentMeta.tagline,
                overview: details.overview || currentMeta.overview,
                cast: details.cast || currentMeta.cast,
                crew: details.crew || currentMeta.crew,
              };
              if (details.genre && !item.genre) updatePayload.genre = details.genre;
            }
          } else if (type === "cds") {
            updatedMeta = {
              ...updatedMeta,
              artist: top.artist || currentMeta.artist,
              label: top.label || currentMeta.label,
              tracklist: top.tracklist || currentMeta.tracklist,
              source: top.source || currentMeta.source,
            };
            if (top.genre && !item.genre) updatePayload.genre = top.genre;
            if (top.cover_url && !item.poster_url) updatePayload.poster_url = top.cover_url;
          } else if (type === "games") {
            updatedMeta = {
              ...updatedMeta,
              developer: top.developer || currentMeta.developer,
              publisher: top.publisher || currentMeta.publisher,
              platforms: top.platforms || currentMeta.platforms,
              overview: top.description || currentMeta.overview,
              source: top.source || currentMeta.source,
            };
            if (top.genre && !item.genre) updatePayload.genre = top.genre;
            if (top.cover_url && !item.poster_url) updatePayload.poster_url = top.cover_url;
          }

          updatePayload.metadata = updatedMeta;
          const { error: updErr } = await supabase
            .from("media_items")
            .update(updatePayload)
            .eq("id", item.id);
          if (!updErr) updated++;
        } catch {
          // Skip failed lookups
        }

        setProgress(`${i + 1}/${candidates.length} — updated ${updated} items`);

        if (i < candidates.length - 1) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      toast({
        title: "Metadata backfill complete!",
        description: `Updated metadata for ${updated} items across all categories.`,
      });
    } catch (err: any) {
      toast({ title: "Backfill failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={handleBackfill}
        disabled={running}
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
        {running ? "Fetching metadata..." : "Re-fetch All Metadata"}
      </Button>
      {progress && <p className="text-xs text-muted-foreground text-center">{progress}</p>}
      <p className="text-[11px] text-muted-foreground">
        Updates metadata across all categories. Only fills in missing data — won't overwrite existing values.
      </p>
    </div>
  );
}

function GenerateAiCoversButton({ userId }: { userId: string }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const handleGenerate = async () => {
    setRunning(true);
    setProgress("Finding items without cover art…");
    try {
      let allItems: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("media_items")
          .select("id, title, poster_url, metadata, genre")
          .eq("user_id", userId)
          .is("poster_url", null)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allItems = allItems.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      if (allItems.length === 0) {
        toast({ title: "All set!", description: "Every item already has cover art." });
        setRunning(false);
        setProgress("");
        return;
      }

      setProgress(`Generating covers for ${allItems.length} items…`);
      let generated = 0;

      for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        const meta = item.metadata || {};
        const artist = meta.artist || "";
        const genre = item.genre || "";

        try {
          const { data, error } = await supabase.functions.invoke("generate-cover-art", {
            body: { title: item.title, artist, genre },
          });
          if (error) throw error;
          if (data?.cover_url) {
            const { error: updErr } = await supabase
              .from("media_items")
              .update({ poster_url: data.cover_url })
              .eq("id", item.id);
            if (!updErr) generated++;
          }
        } catch {
          // Skip failed generations
        }

        setProgress(`${i + 1}/${allItems.length} — generated ${generated} covers`);

        // Rate limit: 2s between AI calls
        if (i < allItems.length - 1) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }

      toast({
        title: "AI cover generation complete!",
        description: `Generated ${generated} covers for ${allItems.length} items.`,
      });
    } catch (err: any) {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2"
        onClick={handleGenerate}
        disabled={running}
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {running ? "Generating…" : "Generate AI Cover Art"}
      </Button>
      {progress && <p className="text-xs text-muted-foreground text-center">{progress}</p>}
      <p className="text-[11px] text-muted-foreground">
        Creates AI-generated album covers for items without artwork. Uses artist name and title. Only affects items with no existing cover.
      </p>
    </div>
  );
}

function VggImportButton({ userId }: { userId: string }) {
  const [username, setUsername] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");

  const handleImport = async () => {
    if (!username.trim()) return;
    setRunning(true);
    setProgress("Fetching VGG collection…");
    try {
      const session = (await supabase.auth.getSession()).data.session;
      if (!session) throw new Error("Not logged in");

      const { data, error } = await supabase.functions.invoke("vgg-collection", {
        body: { username: username.trim() },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error || "Import failed");

      const items = data.items || [];
      if (items.length === 0) {
        toast({ title: "Empty collection", description: `No owned games found for "${username}".` });
        setRunning(false);
        setProgress("");
        return;
      }

      setProgress(`Found ${items.length} games. Importing…`);

      // Chunk insert
      const CHUNK = 500;
      let inserted = 0;
      for (let i = 0; i < items.length; i += CHUNK) {
        const batch = items.slice(i, i + CHUNK);
        const rows = batch.map((g: any) => ({
          user_id: userId,
          title: g.title,
          year: g.yearPublished || null,
          poster_url: g.imageUrl || null,
          rating: g.rating || null,
          media_type: "games",
          formats: g.platforms && g.platforms.length > 0 ? g.platforms : [],
          metadata: {
            vgg_thing_id: g.vggThingId,
            platforms: g.platforms || [],
            source: "vgg",
          },
        }));

        const { error: insertErr } = await supabase.from("media_items").insert(rows);
        if (insertErr) throw insertErr;
        inserted += batch.length;
        setProgress(`Imported ${inserted} of ${items.length}…`);
      }

      toast({
        title: "VGG import complete!",
        description: `Imported ${inserted} games from "${username}".`,
      });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
      setProgress("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="VGG username…"
          className="flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleImport()}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleImport}
          disabled={running || !username.trim()}
          className="gap-2"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {running ? "Importing…" : "Import"}
        </Button>
      </div>
      {progress && <p className="text-xs text-muted-foreground text-center">{progress}</p>}
      <p className="text-[11px] text-muted-foreground">
        Imports games you own on VideoGameGeek. This adds to your existing Games collection (does not replace).
      </p>
    </div>
  );
}

function UnstackedExportButton({ userId }: { userId: string }) {
  const [running, setRunning] = useState(false);

  const handleExport = async (format: "csv" | "json") => {
    setRunning(true);
    try {
      let allItems: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("media_items")
          .select("*")
          .eq("user_id", userId)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allItems = allItems.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      if (allItems.length === 0) {
        toast({ title: "Nothing to export", description: "Your collection is empty." });
        setRunning(false);
        return;
      }

      const { exportForUnstackedCSV, exportForUnstackedJSON } = await import("@/lib/unstacked-export");
      if (format === "csv") {
        exportForUnstackedCSV(allItems);
      } else {
        exportForUnstackedJSON(allItems);
      }

      toast({ title: "Export complete!", description: `Exported ${allItems.length} items for Unstacked.` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-2"
          onClick={() => handleExport("csv")}
          disabled={running}
        >
          <Download className="h-4 w-4" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1 gap-2"
          onClick={() => handleExport("json")}
          disabled={running}
        >
          <Download className="h-4 w-4" /> JSON
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Exports all collections in Unstacked-compatible format for pricing, selling, and auction creation.
      </p>
    </div>
  );
}
