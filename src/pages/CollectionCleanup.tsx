import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Loader2, AlertTriangle, Scissors, GitMerge, Check, Trash2,
  Search, ChevronDown, ChevronUp, ExternalLink, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { AppFooter } from "@/components/AppFooter";

interface FlaggedItem {
  id: string;
  title: string;
  year: number | null;
  format: string | null;
  formats: string[] | null;
  media_type: string;
  poster_url: string | null;
  external_id: string | null;
  flagType: "slash" | "collection-keyword" | "duplicate";
  duplicateOf?: string; // id of the other item
  dismissed?: boolean;
}

interface TmdbResult {
  tmdb_id: number;
  title: string;
  year: number | null;
  poster_url: string | null;
  genre: string | null;
  overview: string | null;
  runtime: number | null;
  cast: any[];
  crew: any;
}

const COLLECTION_KEYWORDS = /\b(trilogy|quadrilogy|collection|complete\s+series|complete\s+season|box\s*set|anthology|saga)\b/i;

export default function CollectionCleanup() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [flaggedItems, setFlaggedItems] = useState<FlaggedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("ds-cleanup-dismissed");
      return new Set(stored ? JSON.parse(stored) : []);
    } catch { return new Set(); }
  });
  const [showDismissed, setShowDismissed] = useState(false);

  const saveDismissed = useCallback((next: Set<string>) => {
    setDismissed(next);
    localStorage.setItem("ds-cleanup-dismissed", JSON.stringify([...next]));
  }, []);

  const scan = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Fetch all media items for this user
      const allItems: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("media_items")
          .select("id, title, year, format, formats, media_type, poster_url, external_id")
          .eq("user_id", user.id)
          .order("title")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allItems.push(...data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const flags: FlaggedItem[] = [];

      // 1. Slash-titles
      for (const item of allItems) {
        if (item.title.includes(" / ")) {
          flags.push({ ...item, flagType: "slash" });
        }
      }

      // 2. Collection keywords
      for (const item of allItems) {
        if (COLLECTION_KEYWORDS.test(item.title) && !item.title.includes(" / ")) {
          flags.push({ ...item, flagType: "collection-keyword" });
        }
      }

      // 3. Duplicate detection — normalize and group
      const normalize = (t: string) =>
        t.toLowerCase()
          .replace(/['']/g, "'")
          .replace(/[–—]/g, "-")
          .replace(/[:.!?,]/g, "")
          .replace(/\s+/g, " ")
          .trim();

      const groups = new Map<string, any[]>();
      for (const item of allItems) {
        const key = normalize(item.title) + "|" + item.media_type;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      }

      for (const [, group] of groups) {
        if (group.length > 1) {
          // Check if titles are actually different in formatting
          const titles = new Set(group.map((g: any) => g.title));
          if (titles.size > 1) {
            for (const item of group) {
              flags.push({
                ...item,
                flagType: "duplicate",
                duplicateOf: group.find((g: any) => g.id !== item.id)?.id,
              });
            }
          }
        }
      }

      setFlaggedItems(flags);
    } catch (err: any) {
      toast.error("Scan failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) scan();
  }, [user, scan]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-12 w-12 mx-auto text-destructive" />
          <h2 className="text-xl font-bold text-foreground">Sign In Required</h2>
          <Button variant="outline" onClick={() => navigate("/auth")}>Go to Sign In</Button>
        </div>
      </div>
    );
  }

  const activeFlags = flaggedItems.filter(f => !dismissed.has(f.id));
  const dismissedFlags = flaggedItems.filter(f => dismissed.has(f.id));
  const slashFlags = activeFlags.filter(f => f.flagType === "slash");
  const keywordFlags = activeFlags.filter(f => f.flagType === "collection-keyword");
  const dupeFlags = activeFlags.filter(f => f.flagType === "duplicate");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/settings")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Collection Cleanup</h1>
          <Button variant="outline" size="sm" className="ml-auto" onClick={scan} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Re-scan
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-6">
        {loading && flaggedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Scanning collection…</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <SummaryCard label="Slash Titles" count={slashFlags.length} color="text-orange-400" />
              <SummaryCard label="Collection Keywords" count={keywordFlags.length} color="text-blue-400" />
              <SummaryCard label="Possible Duplicates" count={dupeFlags.length} color="text-purple-400" />
            </div>

            {activeFlags.length === 0 && (
              <div className="text-center py-12">
                <Check className="h-12 w-12 mx-auto text-emerald-500 mb-2" />
                <p className="text-foreground font-medium">Collection is clean!</p>
                <p className="text-sm text-muted-foreground">No flagged entries found.</p>
              </div>
            )}

            {/* Slash titles */}
            {slashFlags.length > 0 && (
              <FlagSection
                title="Slash Titles"
                description="Entries with ' / ' in the title — likely multi-movie packs that should be split into individual records."
                badgeColor="bg-orange-500/20 text-orange-400"
                items={slashFlags}
                onDismiss={(id) => saveDismissed(new Set([...dismissed, id]))}
                onDelete={async (id) => {
                  await supabase.from("media_copies").delete().eq("media_item_id", id);
                  await supabase.from("media_items").delete().eq("id", id);
                  setFlaggedItems(prev => prev.filter(f => f.id !== id));
                  toast.success("Entry deleted");
                }}
                onSplit={async (item) => {
                  try {
                    const { data, error } = await supabase.functions.invoke("cleanup-slash-titles", {
                      body: { action: "split-single", item_id: item.id },
                    });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);
                    toast.success(`Split into ${data.created_count} individual entries`);
                    scan();
                  } catch (err: any) {
                    toast.error("Split failed: " + err.message);
                  }
                }}
                type="slash"
              />
            )}

            {/* Collection keywords */}
            {keywordFlags.length > 0 && (
              <FlagSection
                title="Collection Keywords"
                description="Titles containing words like 'Trilogy', 'Collection', 'Box Set' — review if these should be split into individual entries."
                badgeColor="bg-blue-500/20 text-blue-400"
                items={keywordFlags}
                onDismiss={(id) => saveDismissed(new Set([...dismissed, id]))}
                onDelete={async (id) => {
                  await supabase.from("media_copies").delete().eq("media_item_id", id);
                  await supabase.from("media_items").delete().eq("id", id);
                  setFlaggedItems(prev => prev.filter(f => f.id !== id));
                  toast.success("Entry deleted");
                }}
                type="keyword"
              />
            )}

            {/* Duplicates */}
            {dupeFlags.length > 0 && (
              <FlagSection
                title="Possible Duplicates"
                description="Titles that appear similar after normalizing punctuation and casing — may need merging."
                badgeColor="bg-purple-500/20 text-purple-400"
                items={dupeFlags}
                onDismiss={(id) => saveDismissed(new Set([...dismissed, id]))}
                onDelete={async (id) => {
                  await supabase.from("media_copies").delete().eq("media_item_id", id);
                  await supabase.from("media_items").delete().eq("id", id);
                  setFlaggedItems(prev => prev.filter(f => f.id !== id));
                  toast.success("Entry deleted");
                }}
                onMerge={async (keepId, deleteId) => {
                  try {
                    const { data, error } = await supabase.functions.invoke("cleanup-slash-titles", {
                      body: { action: "merge", keep_id: keepId, delete_id: deleteId },
                    });
                    if (error) throw error;
                    if (data?.error) throw new Error(data.error);
                    toast.success("Merged successfully");
                    scan();
                  } catch (err: any) {
                    toast.error("Merge failed: " + err.message);
                  }
                }}
                type="duplicate"
              />
            )}

            {/* Dismissed section */}
            {dismissedFlags.length > 0 && (
              <div className="border-t border-border pt-4">
                <button
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setShowDismissed(!showDismissed)}
                >
                  {showDismissed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {dismissedFlags.length} dismissed {dismissedFlags.length === 1 ? "entry" : "entries"}
                </button>
                {showDismissed && (
                  <div className="mt-2 space-y-1">
                    {dismissedFlags.map(item => (
                      <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 text-sm">
                        <span className="text-muted-foreground flex-1 truncate">{item.title}</span>
                        <Button
                          variant="ghost" size="sm"
                          className="text-xs h-7"
                          onClick={() => {
                            const next = new Set(dismissed);
                            next.delete(item.id);
                            saveDismissed(next);
                          }}
                        >
                          Restore
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
      <AppFooter />
    </div>
  );
}

function SummaryCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-center">
      <div className={`text-2xl font-bold ${color}`}>{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function FlagSection({
  title, description, badgeColor, items, onDismiss, onDelete, onSplit, onMerge, type,
}: {
  title: string;
  description: string;
  badgeColor: string;
  items: FlaggedItem[];
  onDismiss: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onSplit?: (item: FlaggedItem) => Promise<void>;
  onMerge?: (keepId: string, deleteId: string) => Promise<void>;
  type: "slash" | "keyword" | "duplicate";
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-foreground font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <FlaggedItemCard
            key={item.id}
            item={item}
            badgeColor={badgeColor}
            onDismiss={onDismiss}
            onDelete={onDelete}
            onSplit={onSplit}
            onMerge={onMerge}
            type={type}
            items={items}
          />
        ))}
      </div>
    </div>
  );
}

function FlaggedItemCard({
  item, badgeColor, onDismiss, onDelete, onSplit, onMerge, type, items,
}: {
  item: FlaggedItem;
  badgeColor: string;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  onSplit?: (item: FlaggedItem) => Promise<void>;
  onMerge?: (keepId: string, deleteId: string) => Promise<void>;
  type: "slash" | "keyword" | "duplicate";
  items: FlaggedItem[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewTitles, setPreviewTitles] = useState<string[]>([]);
  const [tmdbResults, setTmdbResults] = useState<TmdbResult[]>([]);
  const [lookingUp, setLookingUp] = useState(false);

  const splitTitles = type === "slash" ? item.title.split(" / ").map(t => t.trim()) : [];

  const handlePreviewLookup = async () => {
    setLookingUp(true);
    setTmdbResults([]);
    try {
      const results: TmdbResult[] = [];
      for (const title of splitTitles) {
        const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
          body: { query: title, media_type: item.media_type },
        });
        if (data && !data.error && data.title) {
          results.push(data);
        } else {
          results.push({ tmdb_id: 0, title, year: null, poster_url: null, genre: null, overview: null, runtime: null, cast: [], crew: {} });
        }
      }
      setTmdbResults(results);
    } catch (err: any) {
      toast.error("Lookup failed: " + err.message);
    } finally {
      setLookingUp(false);
    }
  };

  const duplicate = type === "duplicate" && item.duplicateOf
    ? items.find(i => i.id === item.duplicateOf)
    : null;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {item.poster_url && (
          <img src={item.poster_url} alt="" className="w-10 h-14 rounded object-cover shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{item.title}</span>
            {item.year && <span className="text-xs text-muted-foreground">({item.year})</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${badgeColor} border-0`}>
              {type === "slash" ? "Slash Title" : type === "keyword" ? "Collection Keyword" : "Duplicate"}
            </Badge>
            {item.formats?.map(f => (
              <Badge key={f} variant="secondary" className="text-[10px] px-1.5 py-0">{f}</Badge>
            ))}
          </div>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>

      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          {/* Slash title: show split preview */}
          {type === "slash" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Will split into:</p>
              <div className="flex flex-wrap gap-1.5">
                {splitTitles.map((t, i) => (
                  <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>

              {tmdbResults.length === 0 && (
                <Button size="sm" variant="outline" onClick={handlePreviewLookup} disabled={lookingUp}>
                  {lookingUp ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                  Preview TMDB Matches
                </Button>
              )}

              {tmdbResults.length > 0 && (
                <div className="space-y-1.5">
                  {tmdbResults.map((r, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-muted/40">
                      {r.poster_url ? (
                        <img src={r.poster_url} alt="" className="w-8 h-12 rounded object-cover" />
                      ) : (
                        <div className="w-8 h-12 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">?</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground">{r.year} • {r.genre}</p>
                      </div>
                      {r.tmdb_id > 0 ? (
                        <Badge variant="secondary" className="text-[10px] shrink-0">TMDB #{r.tmdb_id}</Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] shrink-0">No match</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Duplicate: show the other entry */}
          {type === "duplicate" && duplicate && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Duplicate of:</p>
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted/40">
                {duplicate.poster_url && (
                  <img src={duplicate.poster_url} alt="" className="w-8 h-12 rounded object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{duplicate.title}</p>
                  <p className="text-xs text-muted-foreground">{duplicate.year}</p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {type === "slash" && onSplit && (
              <Button
                size="sm" variant="default"
                disabled={splitting || tmdbResults.length === 0 || tmdbResults.some(r => r.tmdb_id === 0)}
                onClick={async () => {
                  setSplitting(true);
                  await onSplit(item);
                  setSplitting(false);
                }}
              >
                {splitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Scissors className="h-3 w-3 mr-1" />}
                Split & Replace
              </Button>
            )}

            {type === "duplicate" && onMerge && duplicate && (
              <Button
                size="sm" variant="default"
                disabled={merging}
                onClick={async () => {
                  setMerging(true);
                  await onMerge(duplicate.id, item.id);
                  setMerging(false);
                }}
              >
                {merging ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <GitMerge className="h-3 w-3 mr-1" />}
                Keep Other, Delete This
              </Button>
            )}

            <Button size="sm" variant="outline" onClick={() => onDismiss(item.id)}>
              <Check className="h-3 w-3 mr-1" />
              Mark Correct
            </Button>

            <Button
              size="sm" variant="ghost"
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={deleting}
              onClick={async () => {
                if (!confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
                setDeleting(true);
                await onDelete(item.id);
                setDeleting(false);
              }}
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
