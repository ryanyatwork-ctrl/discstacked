import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, Tables } from "@/integrations/supabase/types";

export type EditionCatalogRow = Tables<"edition_catalog">;

export type EditionCatalogSeed = {
  barcode: string;
  media_type?: string;
  title: string;
  year?: number | null;
  external_id?: string | null;
  product_title?: string | null;
  edition?: string | null;
  formats?: string[];
  disc_count?: number | null;
  package_image_url?: string | null;
  source?: string;
  source_confidence?: number;
  metadata?: Record<string, any>;
};

function normalizeBarcode(barcode: string | null | undefined) {
  return String(barcode || "").trim();
}

function dedupeFormats(formats: (string | null | undefined)[] | undefined) {
  return Array.from(new Set((formats || []).filter((value): value is string => Boolean(value))));
}

export async function lookupEditionCatalogByBarcode(barcode: string) {
  const normalized = normalizeBarcode(barcode);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("edition_catalog")
    .select("*")
    .eq("barcode", normalized)
    .maybeSingle();

  if (error) {
    if (String((error as any).message || "").toLowerCase().includes("edition_catalog")) {
      return null;
    }
    throw error;
  }
  return data;
}

export async function upsertEditionCatalogSeeds(seeds: EditionCatalogSeed[]) {
  const rows: TablesInsert<"edition_catalog">[] = seeds
    .map((seed) => {
      const barcode = normalizeBarcode(seed.barcode);
      if (!barcode || !seed.title?.trim()) return null;

      return {
        barcode,
        media_type: seed.media_type || "movies",
        title: seed.title.trim(),
        year: seed.year ?? null,
        external_id: seed.external_id ?? null,
        product_title: seed.product_title?.trim() || seed.title.trim(),
        edition: seed.edition?.trim() || null,
        formats: dedupeFormats(seed.formats),
        disc_count: seed.disc_count ?? null,
        package_image_url: seed.package_image_url ?? null,
        source: seed.source || "unknown",
        source_confidence: seed.source_confidence ?? 50,
        metadata: seed.metadata || {},
        last_confirmed_at: new Date().toISOString(),
      };
    })
    .filter((row): row is TablesInsert<"edition_catalog"> => Boolean(row));

  if (rows.length === 0) return 0;

  const { error } = await supabase
    .from("edition_catalog")
    .upsert(rows, { onConflict: "barcode" });

  if (error) {
    if (String((error as any).message || "").toLowerCase().includes("edition_catalog")) {
      return 0;
    }
    throw error;
  }
  return rows.length;
}

export function buildEditionCatalogSeedFromItem(item: {
  barcode?: string | null;
  title?: string | null;
  year?: number | null;
  format?: string | null;
  formats?: string[] | null;
  media_type?: string | null;
  external_id?: string | null;
  metadata?: Record<string, any> | null;
  poster_url?: string | null;
}) {
  const barcode = normalizeBarcode(item.barcode);
  const title = item.title?.trim();
  if (!barcode || !title) return null;

  const editionMeta = item.metadata?.edition || {};
  const discCount =
    editionMeta.disc_count ??
    item.metadata?.disc_count ??
    (Array.isArray(item.metadata?.discs) ? item.metadata.discs.length : null) ??
    null;

  return {
    barcode,
    media_type: item.media_type || "movies",
    title,
    year: item.year ?? null,
    external_id: item.external_id ?? null,
    product_title: editionMeta.package_title || editionMeta.barcode_title || title,
    edition: editionMeta.label || item.metadata?.edition_label || null,
    formats: dedupeFormats([
      ...(item.formats || []),
      item.format || null,
      ...(editionMeta.formats || []),
    ]),
    disc_count: discCount,
    package_image_url: editionMeta.cover_art_url || item.poster_url || null,
    source: "discstacked_confirmed",
    source_confidence: 100,
    metadata: item.metadata || {},
  } satisfies EditionCatalogSeed;
}
