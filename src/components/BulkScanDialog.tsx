import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { ScanBarcode, Camera, Loader2, Check, X, Trash2, Plus, AlertTriangle, Copy, Keyboard, Bluetooth, Layers, Package, Pencil, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab, FORMATS } from "@/lib/types";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { lookupBarcode as unifiedLookupBarcode, searchMedia, MediaLookupResult, MultiMovieResult, MultiSeasonResult, isHighConfidenceFallbackResult } from "@/lib/media-lookup";
import { createPhysicalProductForItem, createMultiMovieProduct, createMultiSeasonProduct } from "@/hooks/usePhysicalProducts";
import { buildLookupMetadata, getLookupExternalId } from "@/lib/media-item-utils";
import { buildDiscEntries } from "@/lib/collector-utils";
import { buildEditionCatalogSeedFromItem, upsertEditionCatalogSeeds } from "@/lib/edition-catalog";

interface ScanQueueItem {
  barcode: string;
  status: "looking" | "found" | "not_found" | "error" | "ambiguous" | "multi_movie" | "multi_season";
  title?: string;
  year?: number | null;
  genre?: string | null;
  posterUrl?: string | null;
  runtime?: number | null;
  tagline?: string | null;
  artist?: string | null;
  author?: string | null;
  tmdb_id?: number | null;
  format: string;
  formats: string[];
  selected: boolean;
  alreadyOwned?: boolean;
  differentEdition?: boolean;
  existingTitle?: string;
  existingFormats?: string[];
  extraMeta?: Record<string, any>;
  candidates?: MediaLookupResult[];
  // Multi-movie fields
  multiMovie?: MultiMovieResult;
  // Multi-season TV box set fields
  multiSeason?: MultiSeasonResult;
}

interface BulkScanDialogProps {
  activeTab: MediaTab;
}

const TAB_LABELS: Record<MediaTab, string> = {
  movies: "Bulk Barcode Scan",
  "music-films": "Bulk Barcode Scan",
  cds: "Bulk Barcode Scan — Music",
  games: "Bulk Scan — Games",
};

function humanizeSource(source?: string | null) {
  const normalized = String(source || "").trim();
  if (!normalized) return null;

  const labels: Record<string, string> = {
    tmdb: "TMDB",
    discogs: "Discogs",
    musicbrainz: "MusicBrainz",
    igdb: "IGDB",
    rawg: "RAWG",
    edition_catalog: "DiscStacked Catalog",
    barcode: "Barcode Match",
    manual_barcode_entry: "Manual Entry",
  };

  return labels[normalized] || normalized.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export function BulkScanDialog({ activeTab }: BulkScanDialogProps) {
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<ScanQueueItem[]>([]);
  const [editingBarcode, setEditingBarcode] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [scanning, setScanning] = useState(false);
  const [btMode, setBtMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [defaultFormat, setDefaultFormat] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const processedBarcodesRef = useRef(new Set<string>());
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Reset default format when tab changes
  useEffect(() => {
    setDefaultFormat("");
  }, [activeTab]);

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch {}
      html5QrCodeRef.current = null;
    }
    setScanning(false);
  };

  const buildFoundQueueItem = (result: MediaLookupResult): Partial<ScanQueueItem> => {
    const detectedFormats = result.detected_formats;

    return {
      status: "found",
      title: result.title,
      year: result.year,
      genre: result.genre,
      posterUrl: result.cover_url,
      runtime: result.runtime,
      tagline: result.tagline,
      artist: result.artist,
      author: result.author,
      tmdb_id: result.tmdb_id,
      ...(detectedFormats && detectedFormats.length > 0 ? {
        format: detectedFormats[0],
        formats: detectedFormats,
      } : {}),
      extraMeta: buildLookupMetadata(result),
      candidates: undefined,
    };
  };

  const doLookup = async (barcode: string): Promise<Partial<ScanQueueItem>> => {
    try {
      const result = await unifiedLookupBarcode(activeTab, barcode);

      // Multi-movie set detected
      if (result.multiMovie) {
        return {
          status: "multi_movie",
          title: result.multiMovie.collection_name || result.multiMovie.product_title,
          posterUrl: result.multiMovie.cover_art_url || null,
          multiMovie: result.multiMovie,
          formats: result.multiMovie.detected_formats,
          format: result.multiMovie.detected_formats[0] || "",
        };
      }

      // Multi-season TV box set detected
      if (result.multiSeason) {
        return {
          status: "multi_season",
          title: result.multiSeason.show_name || result.multiSeason.product_title,
          posterUrl: result.multiSeason.cover_art_url || null,
          multiSeason: result.multiSeason,
          formats: result.multiSeason.detected_formats,
          format: result.multiSeason.detected_formats[0] || "",
        };
      }

      if (result.direct) {
        return buildFoundQueueItem(result.direct);
      }
      if (result.results && result.results.length > 0) {
        return {
          status: result.results.length === 1 ? "found" : "ambiguous",
          ...(result.results.length === 1 ? buildFoundQueueItem(result.results[0]) : {}),
          title: result.results[0]?.title,
          candidates: result.results.length > 1 ? result.results.slice(0, 5) : undefined,
        };
      }
      if (result.partialTitle) {
        try {
          const searchResults = await searchMedia(activeTab, result.partialTitle);
          if (searchResults.length === 1 && isHighConfidenceFallbackResult(result.partialTitle, searchResults[0])) {
            return buildFoundQueueItem(searchResults[0]);
          }
          if (searchResults.length > 1) {
            return {
              status: "ambiguous",
              title: result.partialTitle,
              candidates: searchResults.slice(0, 5),
              format: result.partialFormats?.[0] || "",
              formats: result.partialFormats || [],
            };
          }
          if (searchResults.length === 1) {
            return {
              status: "ambiguous",
              title: result.partialTitle,
              candidates: searchResults,
              format: result.partialFormats?.[0] || "",
              formats: result.partialFormats || [],
            };
          }
        } catch {}

        return {
          status: "not_found",
          title: result.partialTitle,
          format: result.partialFormats?.[0] || "",
          formats: result.partialFormats || [],
        };
      }
      return { status: "not_found" };
    } catch {
      return { status: "error" };
    }
  };

  const startScanner = async () => {
    setScanning(true);
    processedBarcodesRef.current = new Set(queue.map((q) => q.barcode));
    const { Html5Qrcode } = await import("html5-qrcode");
    await new Promise((r) => setTimeout(r, 100));

    const scanner = new Html5Qrcode("bulk-barcode-scanner");
    html5QrCodeRef.current = scanner;

    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 280, height: 120 } },
        async (decoded: string) => {
          if (processedBarcodesRef.current.has(decoded)) return;
          processedBarcodesRef.current.add(decoded);

          // Add to queue immediately as "looking"
          const fallback = defaultFormat && defaultFormat !== "auto" ? defaultFormat : "";
          const newItem: ScanQueueItem = {
            barcode: decoded,
            status: "looking",
            format: fallback,
            formats: fallback ? [fallback] : [],
            selected: true,
          };
          setQueue((prev) => [newItem, ...prev]);

          // Play a subtle beep via AudioContext
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 1200;
            gain.gain.value = 0.1;
            osc.start();
            osc.stop(ctx.currentTime + 0.1);
          } catch {}

          // Check if already in collection
          let alreadyOwned = false;
          let existingTitle: string | undefined;
          let existingFormats: string[] | undefined;
          if (user) {
            const { data: existing } = await supabase
              .from("media_items")
              .select("title, formats")
              .eq("user_id", user.id)
              .eq("barcode", decoded)
              .limit(1);
            if (existing && existing.length > 0) {
              alreadyOwned = true;
              existingTitle = existing[0].title;
              existingFormats = existing[0].formats || [];
              // Play a different warning tone
              try {
                const ctx = new AudioContext();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 400;
                gain.gain.value = 0.15;
                osc.start();
                osc.stop(ctx.currentTime + 0.3);
              } catch {}
            }
          }

          // Lookup in background using unified lookup
          const result = await doLookup(decoded);
          
          // If not already owned by barcode, check if we own the same title (different edition)
          let differentEdition = false;
          if (!alreadyOwned && user && 'title' in result && result.title) {
            const { data: titleMatch } = await supabase
              .from("media_items")
              .select("title, formats")
              .eq("user_id", user.id)
              .eq("media_type", activeTab)
              .ilike("title", result.title)
              .limit(1);
            if (titleMatch && titleMatch.length > 0) {
              differentEdition = true;
              existingTitle = titleMatch[0].title;
              existingFormats = titleMatch[0].formats || [];
            }
          }
          
          setQueue((prev) =>
            prev.map((item) =>
              item.barcode === decoded
                ? {
                    ...item,
                    ...result,
                    alreadyOwned,
                    differentEdition,
                    existingTitle: existingTitle || ('title' in result ? result.title : undefined),
                    existingFormats,
                    selected: !alreadyOwned,
                  }
                : item
            )
          );
        },
        () => {}
      );
    } catch (err: any) {
      toast({ title: "Camera error", description: err.message || "Could not access camera", variant: "destructive" });
      setScanning(false);
    }
  };

  const toggleItem = (barcode: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.barcode === barcode ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const removeItem = (barcode: string) => {
    setQueue((prev) => prev.filter((item) => item.barcode !== barcode));
    processedBarcodesRef.current.delete(barcode);
  };

  const updateItemFormat = (barcode: string, format: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.barcode === barcode ? { ...item, format } : item
      )
    );
  };

  const startEditTitle = (barcode: string, currentTitle: string) => {
    setBtMode(false);
    setEditingBarcode(barcode);
    setEditTitle(currentTitle || "");
  };

  const handleCandidateSelect = async (barcode: string, candidate: MediaLookupResult) => {
    const queueItem = queue.find((item) => item.barcode === barcode);
    let differentEdition = false;
    let existingTitle = queueItem?.alreadyOwned ? queueItem.existingTitle : undefined;
    let existingFormats = queueItem?.alreadyOwned ? queueItem.existingFormats : undefined;

    if (!queueItem?.alreadyOwned && user && candidate.title) {
      const { data: titleMatch } = await supabase
        .from("media_items")
        .select("title, formats")
        .eq("user_id", user.id)
        .eq("media_type", activeTab)
        .ilike("title", candidate.title)
        .limit(1);

      if (titleMatch && titleMatch.length > 0) {
        differentEdition = true;
        existingTitle = titleMatch[0].title;
        existingFormats = titleMatch[0].formats || [];
      }
    }

    setQueue((prev) =>
      prev.map((item) =>
        item.barcode === barcode
          ? {
              ...item,
              ...buildFoundQueueItem(candidate),
              differentEdition,
              existingTitle,
              existingFormats,
              selected: !(item.alreadyOwned ?? false),
            }
          : item
      )
    );
  };

  const handleTitleSearch = async (barcode: string) => {
    const searchTitle = editTitle.trim();
    if (!searchTitle) return;
    setEditingBarcode(null);
    const queueItem = queue.find((item) => item.barcode === barcode);
    const explicitYear = searchTitle.match(/\((19\d{2}|20\d{2})\)$/)?.[1];
    const searchYear = explicitYear ? parseInt(explicitYear, 10) : queueItem?.year ?? undefined;

    // Set to "looking" state
    setQueue((prev) =>
      prev.map((item) =>
        item.barcode === barcode ? { ...item, status: "looking" as const } : item
      )
    );

    try {
      const tvSeasonPattern = /\b(season|s\d|series|complete\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth))\b/i;
      const strippedTitle = searchTitle.replace(/\s*\((19\d{2}|20\d{2})\)$/, "");
      const searchType = tvSeasonPattern.test(strippedTitle) ? "tv" as const : undefined;
      const results = await searchMedia(activeTab, strippedTitle, { year: searchYear, searchType });
      if (results.length > 0) {
        const top = results[0];
        setQueue((prev) =>
          prev.map((item) =>
            item.barcode === barcode
              ? {
                  ...item,
                  status: "found" as const,
                  title: top.title,
                  year: top.year,
                  genre: top.genre,
                  posterUrl: top.poster_url,
                  tmdb_id: top.tmdb_id,
                  extraMeta: buildLookupMetadata({
                    tmdb_id: top.tmdb_id,
                    runtime: top.runtime,
                    tagline: top.tagline,
                    overview: top.overview,
                    media_type: top.media_type,
                    tmdb_series_id: (top as any).tmdb_series_id,
                    season_number: (top as any).season_number,
                    series_title: (top as any).series_title,
                    episode_count: (top as any).episode_count,
                  }),
                  selected: true,
                }
              : item
          )
        );
      } else {
        setQueue((prev) =>
          prev.map((item) =>
            item.barcode === barcode
              ? {
                  ...item,
                  status: "found" as const,
                  title: searchTitle,
                  year: searchYear ?? null,
                  genre: null,
                  posterUrl: null,
                  tmdb_id: null,
                  extraMeta: {
                    ...(item.extraMeta || {}),
                    source: "manual_barcode_entry",
                  },
                  selected: true,
                }
              : item
          )
        );
        toast({
          title: "Using manual title",
          description: `No lookup match for "${searchTitle}", but you can still add it manually.`,
        });
      }
    } catch {
      setQueue((prev) =>
        prev.map((item) =>
          item.barcode === barcode ? { ...item, status: "error" as const } : item
        )
      );
      toast({ title: "Search failed", variant: "destructive" });
    }
  };

  // Manual barcode entry
  const handleManualAdd = async () => {
    const code = manualBarcode.trim();
    if (!code || processedBarcodesRef.current.has(code)) return;
    processedBarcodesRef.current.add(code);
    setManualBarcode("");

    const fallback = defaultFormat && defaultFormat !== "auto" ? defaultFormat : "";
    const newItem: ScanQueueItem = {
      barcode: code,
      status: "looking",
      format: fallback,
      formats: fallback ? [fallback] : [],
      selected: true,
    };
    setQueue((prev) => [newItem, ...prev]);

    // Check existing
    let alreadyOwned = false;
    let existingTitle: string | undefined;
    let existingFormats: string[] | undefined;
    if (user) {
      const { data: existing } = await supabase
        .from("media_items").select("title, formats")
        .eq("user_id", user.id).eq("barcode", code).limit(1);
      if (existing && existing.length > 0) {
        alreadyOwned = true;
        existingTitle = existing[0].title;
        existingFormats = existing[0].formats || [];
      }
    }

    const result = await doLookup(code);
    
    let differentEdition = false;
    if (!alreadyOwned && user && 'title' in result && result.title) {
      const { data: titleMatch } = await supabase
        .from("media_items").select("title, formats")
        .eq("user_id", user.id).eq("media_type", activeTab)
        .ilike("title", result.title).limit(1);
      if (titleMatch && titleMatch.length > 0) {
        differentEdition = true;
        existingTitle = existingTitle || titleMatch[0].title;
        existingFormats = existingFormats || titleMatch[0].formats || [];
      }
    }
    
    setQueue((prev) =>
      prev.map((item) =>
        item.barcode === code
          ? { ...item, ...result, alreadyOwned, differentEdition, existingTitle: existingTitle || ('title' in result ? result.title : undefined), existingFormats, selected: !alreadyOwned }
          : item
      )
    );
  };

  const handleCommit = async () => {
    const singleItems = queue.filter((item) => item.selected && item.status === "found" && item.title);
    const multiItems = queue.filter((item) => item.selected && item.status === "multi_movie" && item.multiMovie);
    const seasonItems = queue.filter((item) => item.selected && item.status === "multi_season" && item.multiSeason);
    const totalCount = singleItems.length + multiItems.length + seasonItems.length;
    if (totalCount === 0 || !user) return;
    setSaving(true);
    try {
      // Handle single items
      if (singleItems.length > 0) {
        const rows = singleItems.map((item) => ({
          user_id: user.id,
          title: item.title!,
          year: item.year ?? null,
          format: item.formats.length > 0 ? item.formats[0] : (item.format || null),
          formats: item.formats.length > 0 ? item.formats : (item.format ? [item.format] : []),
          genre: item.genre ?? null,
          poster_url: item.posterUrl ?? null,
          barcode: item.barcode,
          media_type: activeTab,
          external_id: getLookupExternalId({
            tmdb_id: item.tmdb_id || null,
            media_type: item.extraMeta?.content_type || null,
            tmdb_series_id: item.extraMeta?.tmdb_series_id || null,
            season_number: item.extraMeta?.season_number || null,
          }),
          metadata: {
            ...(item.runtime ? { runtime: item.runtime } : {}),
            ...(item.tagline ? { tagline: item.tagline } : {}),
            ...(item.artist ? { artist: item.artist } : {}),
            ...(item.author ? { author: item.author } : {}),
            ...(item.extraMeta || {}),
          },
        }));

        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { data: inserted, error } = await supabase.from("media_items").insert(chunk as any).select();
          if (error) throw error;

          if (inserted) {
            const editionSeeds = inserted.map((savedRow, j) =>
              buildEditionCatalogSeedFromItem({
                barcode: savedRow.barcode,
                title: savedRow.title,
                year: savedRow.year,
                format: savedRow.format,
                formats: savedRow.formats,
                media_type: savedRow.media_type,
                external_id: savedRow.external_id,
                metadata: rows[i + j].metadata as Record<string, any>,
                poster_url: savedRow.poster_url,
              }),
            ).filter(Boolean);

            if (editionSeeds.length > 0) {
              await upsertEditionCatalogSeeds(editionSeeds);
            }

            for (let j = 0; j < inserted.length; j++) {
              const item = singleItems[i + j];
              try {
                await createPhysicalProductForItem(user.id, inserted[j].id, {
                  barcode: item.barcode,
                  productTitle: item.extraMeta?.edition?.package_title || item.title!,
                  formats: item.formats.length > 0 ? item.formats : (item.format ? [item.format] : []),
                  mediaType: activeTab,
                  format: item.formats[0] || item.format || null,
                  discCount: item.extraMeta?.edition?.disc_count || item.extraMeta?.discs?.length || 1,
                  metadata: rows[i + j].metadata as Record<string, any>,
                });
              } catch (ppErr) {
                console.warn("Physical product creation failed:", ppErr);
              }
            }
          }
        }
      }

      // Handle multi-movie items
      for (const item of multiItems) {
        const mm = item.multiMovie!;
        try {
          await createMultiMovieProduct(
            user.id,
            {
              barcode: item.barcode,
              productTitle: mm.collection_name || mm.product_title,
              formats: mm.detected_formats,
              mediaType: activeTab,
              discCount: mm.disc_count || mm.movies.length,
              metadata: {
                edition: {
                  label: mm.edition_label || undefined,
                  package_title: mm.collection_name || mm.product_title,
                  barcode_title: mm.barcode_title,
                  formats: mm.detected_formats,
                  cover_art_url: mm.cover_art_url || null,
                  disc_count: mm.disc_count || mm.movies.length,
                  digital_code_expected: mm.digital_code_expected ?? mm.detected_formats.includes("Digital"),
                  slipcover_expected: mm.slipcover_expected ?? null,
                },
                discs: buildDiscEntries(mm.detected_formats, mm.disc_count || mm.movies.length),
                slipcover_status: mm.slipcover_expected === false ? "not_included" : "unknown",
                digital_code_status: (mm.digital_code_expected ?? mm.detected_formats.includes("Digital")) ? "Unknown" : "Not Included",
              },
            },
            mm.movies.map(m => ({
              tmdb_id: m.tmdb_id,
              title: m.title,
              year: m.year,
              poster_url: m.poster_url,
              overview: m.overview || null,
            }))
          );
          await upsertEditionCatalogSeeds([{
            barcode: item.barcode,
            media_type: activeTab,
            title: mm.collection_name || mm.product_title,
            product_title: mm.collection_name || mm.product_title,
            formats: mm.detected_formats,
            disc_count: mm.disc_count || mm.movies.length,
            package_image_url: mm.cover_art_url || null,
            edition: mm.edition_label || null,
            source: "discstacked_confirmed",
            source_confidence: 100,
            metadata: {
              is_multi_movie: true,
              included_titles: mm.movies.map((movie) => ({
                title: movie.title,
                year: movie.year,
                tmdb_id: movie.tmdb_id,
              })),
            },
          }]);
        } catch (mmErr: any) {
          console.warn("Multi-movie creation failed:", mmErr);
        }
      }

      for (const item of seasonItems) {
        const seasonBox = item.multiSeason!;
        try {
          await createMultiSeasonProduct(
            user.id,
            {
              barcode: item.barcode,
              productTitle: seasonBox.product_title,
              formats: seasonBox.detected_formats,
              mediaType: activeTab,
              discCount: seasonBox.disc_count || seasonBox.seasons.length,
              metadata: {
                edition: {
                  label: seasonBox.edition_label || undefined,
                  package_title: seasonBox.product_title,
                  barcode_title: seasonBox.barcode_title,
                  formats: seasonBox.detected_formats,
                  cover_art_url: seasonBox.cover_art_url || null,
                  disc_count: seasonBox.disc_count || seasonBox.seasons.length,
                  digital_code_expected: seasonBox.digital_code_expected ?? seasonBox.detected_formats.includes("Digital"),
                  slipcover_expected: seasonBox.slipcover_expected ?? null,
                },
                discs: buildDiscEntries(seasonBox.detected_formats, seasonBox.disc_count || seasonBox.seasons.length),
                slipcover_status: seasonBox.slipcover_expected === false ? "not_included" : "unknown",
                digital_code_status: (seasonBox.digital_code_expected ?? seasonBox.detected_formats.includes("Digital")) ? "Unknown" : "Not Included",
              },
            },
            {
              tmdb_series_id: seasonBox.tmdb_series_id,
              show_name: seasonBox.show_name,
            },
            seasonBox.seasons.map((season) => ({
              season_number: season.season_number,
              title: season.title,
              year: season.year,
              poster_url: season.poster_url,
              overview: season.overview || null,
              episode_count: season.episode_count || null,
            })),
          );
          await upsertEditionCatalogSeeds([{
            barcode: item.barcode,
            media_type: activeTab,
            title: seasonBox.show_name,
            product_title: seasonBox.product_title,
            formats: seasonBox.detected_formats,
            disc_count: seasonBox.disc_count || seasonBox.seasons.length,
            package_image_url: seasonBox.cover_art_url || null,
            edition: seasonBox.edition_label || null,
            external_id: String(seasonBox.tmdb_series_id),
            source: "discstacked_confirmed",
            source_confidence: 100,
            metadata: {
              is_multi_season: true,
              tmdb_series_id: seasonBox.tmdb_series_id,
              included_titles: seasonBox.seasons.map((season) => ({
                title: season.title,
                year: season.year,
                season_number: season.season_number,
              })),
            },
          }]);
        } catch (seasonErr: any) {
          console.warn("Multi-season creation failed:", seasonErr);
        }
      }

      toast({ title: "Added!", description: `${totalCount} items added to your collection.` });
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
      setQueue([]);
      processedBarcodesRef.current.clear();
      setOpen(false);
    } catch (err: any) {
      toast({ title: "Failed to add", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  useEffect(() => {
    if (!open) {
      stopScanner();
      setQueue([]);
      processedBarcodesRef.current.clear();
    }
  }, [open]);

  const selectedCount = queue.filter((q) => q.selected && (q.status === "found" || q.status === "multi_movie" || q.status === "multi_season")).length;
  const lookingCount = queue.filter((q) => q.status === "looking").length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" title="Bulk Scan">
          <ScanBarcode className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">{TAB_LABELS[activeTab]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* Scanner mode buttons */}
          <div className="flex gap-2">
            {scanning ? (
              <div className="relative flex-1">
                <div id="bulk-barcode-scanner" ref={scannerRef} className="w-full rounded-md overflow-hidden" />
                <Button size="sm" variant="destructive" className="absolute top-2 right-2" onClick={stopScanner}>
                  Stop Scanner
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-1">
                  Keep scanning — each barcode is looked up automatically
                </p>
              </div>
            ) : (
              <>
                <Button variant={btMode ? "outline" : "outline"} className="flex-1 gap-2" onClick={() => { setBtMode(false); startScanner(); }}>
                  <Camera className="h-4 w-4" />
                  {queue.length > 0 ? "Resume Camera" : "Camera Scan"}
                </Button>
                <Button
                  variant={btMode ? "default" : "outline"}
                  className="flex-1 gap-2"
                  onClick={() => {
                    setBtMode((prev) => !prev);
                    if (!btMode) {
                      setTimeout(() => manualInputRef.current?.focus(), 100);
                    }
                  }}
                >
                  <Bluetooth className="h-4 w-4" />
                  {btMode ? "BT Scanner Active" : "Bluetooth Scanner"}
                </Button>
              </>
            )}
          </div>

          {/* Bluetooth mode banner */}
          {btMode && !scanning && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-center space-y-2">
              <p className="text-sm font-medium text-foreground">Bluetooth Scanner Mode</p>
              <p className="text-xs text-muted-foreground">
                Scan barcodes with your paired BT scanner — each scan auto-submits
              </p>
              <Input
                ref={manualInputRef}
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Waiting for scan…"
                className="h-10 text-center text-lg font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleManualAdd();
                    setTimeout(() => manualInputRef.current?.focus(), 50);
                  }
                }}
                onBlur={() => {
                  // Re-focus after a short delay to keep input ready for BT scanner
                  if (btMode && !editingBarcode) setTimeout(() => manualInputRef.current?.focus(), 200);
                }}
              />
            </div>
          )}

          {/* Manual barcode/ISBN entry (always visible when not in BT mode) */}
          {!btMode && (
            <div className="flex gap-2">
              <Input
                ref={manualInputRef}
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value)}
                placeholder="Type barcode/UPC…"
                className="flex-1 h-8 text-sm"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleManualAdd()}
              />
              <Button variant="outline" size="sm" onClick={handleManualAdd} disabled={!manualBarcode.trim()} className="gap-1">
                <Keyboard className="h-3 h-3" /> Add
              </Button>
            </div>
          )}

          {/* Queue */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">
                Scanned: {queue.length} items
                {lookingCount > 0 && ` · ${lookingCount} looking up…`}
                {selectedCount > 0 && ` · ${selectedCount} selected`}
              </p>
              <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                {queue.map((item) => (
                  <div
                    key={item.barcode}
                    className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
                      item.alreadyOwned && !item.selected
                        ? "border-warning/40 bg-warning/5"
                        : item.selected ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    {/* Poster thumbnail */}
                    <div className="w-10 h-14 rounded overflow-hidden shrink-0 bg-secondary">
                      {item.posterUrl ? (
                        <img src={item.posterUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {item.status === "looking" ? (
                            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                          ) : item.status === "not_found" ? (
                            <AlertTriangle className="w-4 h-4 text-destructive" />
                          ) : (
                            <X className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {editingBarcode === item.barcode ? (
                        <div className="flex gap-1 items-center">
                          <Input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleTitleSearch(item.barcode)}
                            className="h-7 text-sm flex-1"
                            autoFocus
                          />
                          <Button variant="default" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleTitleSearch(item.barcode)}>
                            <Search className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setEditingBarcode(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : item.status === "looking" ? (
                        <p className="text-sm text-muted-foreground">Looking up {item.barcode}…</p>
                      ) : item.status === "multi_movie" && item.multiMovie ? (
                        <>
                          <div className="flex items-center gap-1">
                            <Package className="w-3 h-3 text-primary" />
                            <p className="text-sm font-medium text-primary truncate">{item.multiMovie.collection_name || item.multiMovie.product_title}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {item.multiMovie.movies.length} movies: {item.multiMovie.movies.map(m => m.title).join(", ")}
                          </p>
                          {item.multiMovie.detected_formats.length > 0 && (
                            <div className="flex gap-1 mt-0.5">
                              {item.multiMovie.detected_formats.map(f => (
                                <span key={f} className="px-1 py-0 rounded text-[9px] font-medium bg-primary/20 text-primary">{f}</span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : item.status === "multi_season" && item.multiSeason ? (
                        <>
                          <div className="flex items-center gap-1">
                            <Package className="w-3 h-3 text-primary" />
                            <p className="text-sm font-medium text-primary truncate">{item.multiSeason.product_title}</p>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {item.multiSeason.seasons.length} seasons: {item.multiSeason.seasons.map((season) => season.title).join(", ")}
                          </p>
                          {item.multiSeason.detected_formats.length > 0 && (
                            <div className="flex gap-1 mt-0.5">
                              {item.multiSeason.detected_formats.map((detectedFormat) => (
                                <span key={detectedFormat} className="px-1 py-0 rounded text-[9px] font-medium bg-primary/20 text-primary">{detectedFormat}</span>
                              ))}
                            </div>
                          )}
                        </>
                      ) : item.status === "ambiguous" && item.candidates && item.candidates.length > 0 ? (
                        <>
                          <p className="text-sm font-medium text-warning">Multiple matches found</p>
                          <p className="text-[10px] text-muted-foreground">Choose the correct title for {item.barcode}</p>
                          <div className="flex flex-wrap gap-1.5 mt-1">
                            {item.candidates.map((candidate) => (
                              <button
                                key={candidate.id}
                                type="button"
                                onClick={() => handleCandidateSelect(item.barcode, candidate)}
                                className="rounded border border-border bg-background px-2 py-1 text-[10px] text-foreground hover:border-primary hover:text-primary"
                              >
                                {candidate.title}
                                {candidate.year ? ` (${candidate.year})` : ""}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : item.status === "found" ? (
                         <>
                           <div className="flex items-center gap-1 group/title">
                             <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                             <button
                               onClick={() => startEditTitle(item.barcode, item.title || "")}
                               className="opacity-0 group-hover/title:opacity-100 transition-opacity shrink-0"
                               title="Edit title & re-search"
                             >
                               <Pencil className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                             </button>
                           </div>
                           <p className="text-[10px] text-muted-foreground truncate">
                             {item.artist || item.author || ""}{(item.artist || item.author) && item.year ? " · " : ""}
                             {item.year}{item.genre ? ` · ${item.genre}` : ""}{item.runtime ? ` · ${Math.floor(item.runtime / 60)}h${item.runtime % 60}m` : ""}
                           </p>
                          {item.alreadyOwned && (
                             <p className="text-[10px] text-warning flex items-center gap-1 mt-0.5">
                               <Copy className="w-3 h-3" />
                               Already in collection as "{item.existingTitle}"
                               {item.existingFormats && item.existingFormats.length > 0 && (
                                 <span className="font-semibold">({item.existingFormats.join(", ")})</span>
                               )}
                               {!item.selected && " — tap ✓ to add anyway"}
                             </p>
                           )}
                           {!item.alreadyOwned && item.differentEdition && (
                              <p className="text-[10px] text-primary flex items-center gap-1 mt-0.5">
                                <Layers className="w-3 h-3" />
                                You own "{item.existingTitle}"
                                {item.existingFormats && item.existingFormats.length > 0 && (
                                  <span className="font-semibold">on {item.existingFormats.join(", ")}</span>
                                )}
                                — this is a different edition
                              </p>
                            )}
                           {(item.extraMeta?.source || item.extraMeta?.source_confidence || item.extraMeta?.edition?.package_title) && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                {humanizeSource(item.extraMeta?.source) ? `Matched by ${humanizeSource(item.extraMeta?.source)}` : "Matched"}
                                {typeof item.extraMeta?.source_confidence === "number" ? ` · ${item.extraMeta.source_confidence}%` : ""}
                                {item.extraMeta?.edition?.package_title ? ` · ${item.extraMeta.edition.package_title}` : ""}
                              </p>
                            )}
                        </>
                      ) : (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1">
                            <p className="text-sm text-destructive truncate">
                              {item.status === "not_found" ? `No match: ${item.barcode}` : `Error: ${item.barcode}`}
                            </p>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => startEditTitle(item.barcode, item.title || "")}
                              title="Search by title"
                            >
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Edit the title to search again, or keep a manual title and add it anyway.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Format selector */}
                    {item.status === "found" && (
                      <Select value={item.format} onValueChange={(v) => updateItemFormat(item.barcode, v)}>
                        <SelectTrigger className="h-7 w-20 text-[10px] shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(FORMATS[activeTab] || []).map((f) => (
                            <SelectItem key={f} value={f}>{f}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Select / remove */}
                    {(item.status === "found" || item.status === "multi_movie" || item.status === "multi_season") && (
                      <Button
                        variant={item.selected ? "default" : "outline"}
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => toggleItem(item.barcode)}
                      >
                        <Check className="w-3 h-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeItem(item.barcode)}>
                      <Trash2 className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Commit */}
          {selectedCount > 0 && (
            <Button onClick={handleCommit} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add {selectedCount} Items to Collection
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
