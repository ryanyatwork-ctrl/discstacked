/**
 * CoverArtPicker
 *
 * Drop-in cover-art picker that calls the `cover-art-search` Supabase edge
 * function and returns multi-source candidates ranked by quality.
 *
 * INTEGRATION:
 *   1. Save this file to `src/components/CoverArtPicker.tsx`
 *   2. In `CoverSearchDialog.tsx`, replace the existing results grid with:
 *
 *        <CoverArtPicker
 *          barcode={item.barcode ?? physicalProduct?.barcode}
 *          tmdbId={Number(item.external_id ?? item.metadata?.tmdb_id) || undefined}
 *          mediaType={item.media_type}
 *          title={item.title}
 *          year={item.year}
 *          artist={item.metadata?.artist}
 *          currentPosterUrl={item.poster_url}
 *          onPick={async (url) => {
 *            await supabase
 *              .from('media_items')
 *              .update({ poster_url: url })
 *              .eq('id', item.id);
 *            onClose?.();
 *          }}
 *        />
 *
 *   3. You can pull `useCoverArtSearch` out into `src/hooks/useCoverArtSearch.ts`
 *      if you'd rather keep the hook separate from the UI.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client'; // adjust to your path
import { Loader2, ImageOff } from 'lucide-react';

// ---------------- types ----------------

export type CoverSource =
  | 'bluray_com'
  | 'upcitemdb'
  | 'tmdb'
  | 'itunes'
  | 'musicbrainz';

export interface CoverCandidate {
  url: string;
  source: CoverSource;
  source_label: string;
  score: number;
  edition_label?: string | null;
  package_title?: string | null;
  width?: number | null;
  height?: number | null;
  notes?: string | null;
}

export interface CoverSearchResponse {
  candidates: CoverCandidate[];
  total_found: number;
  source_counts: Partial<Record<CoverSource, number>>;
  best: CoverCandidate | null;
  debug?: {
    sources_attempted: string[];
    errors: { source: string; error: string }[];
  };
}

interface CoverArtPickerProps {
  barcode?: string | null;
  tmdbId?: number;
  mediaType?: string;
  title: string;
  year?: number | null;
  artist?: string | null;
  currentPosterUrl?: string | null;
  onPick: (url: string, candidate: CoverCandidate) => void | Promise<void>;
}

// ---------------- hook ----------------

export function useCoverArtSearch(args: {
  barcode?: string | null;
  tmdbId?: number;
  mediaType?: string;
  title?: string;
  year?: number | null;
  artist?: string | null;
}) {
  const [data, setData] = useState<CoverSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = JSON.stringify({
    barcode: args.barcode ?? null,
    tmdbId: args.tmdbId ?? null,
    mediaType: args.mediaType ?? null,
    title: args.title ?? null,
    year: args.year ?? null,
    artist: args.artist ?? null,
  });

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!args.barcode && !args.tmdbId && !args.title) {
        setData(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data: res, error: invErr } = await supabase.functions.invoke<CoverSearchResponse>(
          'cover-art-search',
          {
            body: {
              barcode: args.barcode || undefined,
              tmdb_id: args.tmdbId || undefined,
              media_type: args.mediaType || undefined,
              title: args.title || undefined,
              year: args.year || undefined,
              artist: args.artist || undefined,
            },
          }
        );
        if (cancelled) return;
        if (invErr) {
          setError(invErr.message ?? String(invErr));
          setData(null);
        } else {
          setData(res ?? null);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, error };
}

// ---------------- presentational helpers ----------------

const SOURCE_COLOR: Record<CoverSource, string> = {
  bluray_com: 'bg-blue-600/15 text-blue-300 border-blue-700/40',
  upcitemdb: 'bg-emerald-600/15 text-emerald-300 border-emerald-700/40',
  tmdb: 'bg-amber-600/15 text-amber-300 border-amber-700/40',
  itunes: 'bg-pink-600/15 text-pink-300 border-pink-700/40',
  musicbrainz: 'bg-purple-600/15 text-purple-300 border-purple-700/40',
};

const SOURCE_PRIORITY_LABEL: Record<CoverSource, string> = {
  bluray_com: 'Real Package',
  upcitemdb: 'Product Photo',
  tmdb: 'Movie Poster',
  itunes: 'Digital Art',
  musicbrainz: 'Music Cover',
};

function SourceBadge({ source, label }: { source: CoverSource; label: string }) {
  const cls = SOURCE_COLOR[source] ?? 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ---------------- main component ----------------

export default function CoverArtPicker({
  barcode,
  tmdbId,
  mediaType,
  title,
  year,
  artist,
  currentPosterUrl,
  onPick,
}: CoverArtPickerProps) {
  const { data, loading, error } = useCoverArtSearch({
    barcode,
    tmdbId,
    mediaType,
    title,
    year,
    artist,
  });
  const [picking, setPicking] = useState<string | null>(null);

  async function handlePick(c: CoverCandidate) {
    setPicking(c.url);
    try {
      await onPick(c.url, c);
    } finally {
      setPicking(null);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <div className="text-sm">Searching covers across Blu-ray.com, UPCitemdb, TMDB, iTunes…</div>
        {barcode ? <div className="text-xs opacity-70">Barcode: {barcode}</div> : null}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-700/40 bg-red-950/30 p-4 text-sm text-red-200">
        Couldn't search covers: {error}
      </div>
    );
  }

  if (!data || data.candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
        <ImageOff className="h-6 w-6" />
        <div className="text-sm">No cover candidates found.</div>
        <div className="text-xs opacity-70">Try editing the title or year and searching again.</div>
      </div>
    );
  }

  const realPackage = data.candidates.filter((c) => c.source === 'bluray_com' || c.source === 'upcitemdb');
  const digital = data.candidates.filter((c) => c.source !== 'bluray_com' && c.source !== 'upcitemdb');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{data.total_found} candidates</span>
        {Object.entries(data.source_counts).map(([src, count]) => (
          <SourceBadge
            key={src}
            source={src as CoverSource}
            label={`${SOURCE_PRIORITY_LABEL[src as CoverSource] ?? src}: ${count}`}
          />
        ))}
      </div>

      {realPackage.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Actual package photos</h4>
          <CandidateGrid candidates={realPackage} currentPosterUrl={currentPosterUrl} picking={picking} onPick={handlePick} />
        </section>
      )}
      {digital.length > 0 && (
        <section>
          <h4 className="mb-2 text-sm font-semibold text-foreground">Digital posters &amp; alt artwork</h4>
          <CandidateGrid candidates={digital} currentPosterUrl={currentPosterUrl} picking={picking} onPick={handlePick} />
        </section>
      )}
    </div>
  );
}

// ---------------- candidate grid ----------------

function CandidateGrid({
  candidates,
  currentPosterUrl,
  picking,
  onPick,
}: {
  candidates: CoverCandidate[];
  currentPosterUrl?: string | null;
  picking: string | null;
  onPick: (c: CoverCandidate) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {candidates.map((c) => {
        const isCurrent = currentPosterUrl === c.url;
        const isBusy = picking === c.url;
        return (
          <button
            key={c.url}
            type="button"
            onClick={() => onPick(c)}
            disabled={isBusy}
            className={`group relative flex flex-col overflow-hidden rounded-md border bg-card transition hover:border-primary disabled:opacity-50 ${
              isCurrent ? 'border-primary ring-2 ring-primary/40' : 'border-border'
            }`}
            title={c.notes ?? c.source_label}
          >
            <div className="relative aspect-[2/3] w-full bg-muted">
              <img
                src={c.url}
                alt={c.package_title ?? c.source_label}
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
              {isBusy && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </div>
              )}
              {isCurrent && (
                <span className="absolute right-1 top-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                  Current
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1 p-2 text-left">
              <SourceBadge source={c.source} label={SOURCE_PRIORITY_LABEL[c.source]} />
              <div className="line-clamp-2 text-[11px] text-muted-foreground">
                {c.package_title ?? c.source_label}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
