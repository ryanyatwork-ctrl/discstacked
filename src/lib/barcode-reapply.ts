import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import {
  lookupBarcode,
  type MediaLookupResult,
  type MultiMovieResult,
  type MultiSeasonResult,
} from "@/lib/media-lookup";
import { buildDiscEntries, type DiscEntry } from "@/lib/collector-utils";
import { buildLookupMetadata, getLookupExternalId } from "@/lib/media-item-utils";
import type { MediaTab } from "@/lib/types";
import { hasManualArtworkOverride } from "@/lib/cover-utils";

type DbMediaItem = Tables<"media_items">;
type DbPhysicalProduct = Tables<"physical_products">;
type DbMediaCopy = Tables<"media_copies">;

type BarcodeScope = {
  barcode: string;
  mediaType: MediaTab;
  products: DbPhysicalProduct[];
  copies: DbMediaCopy[];
  linkedItems: DbMediaItem[];
  standaloneItems: DbMediaItem[];
};

type ReapplyOptions = {
  onProgress?: (message: string) => void;
};

type ReapplyStats = {
  scanned: number;
  updated: number;
  created: number;
  linked: number;
  skipped: number;
  failures: number;
};

const BARCODE_MEDIA_TYPES: MediaTab[] = ["movies", "music-films", "cds"];

function normalizeTitle(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeStrings(values: (string | null | undefined)[]) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function mergeDiscEntries(existing: unknown, expectedFormats: string[], discCount?: number | null) {
  const expected = buildDiscEntries(expectedFormats, discCount);
  const current = Array.isArray(existing) ? (existing as DiscEntry[]) : [];

  return expected.map((disc, index) => {
    const match = current[index]
      || current.find((entry) => entry?.label === disc.label)
      || current.find((entry) => entry?.format === disc.format && !entry?.missing);

    return match
      ? {
          ...disc,
          condition: match.condition || disc.condition,
          missing: match.missing ?? disc.missing,
          replacementNeeded: match.replacementNeeded ?? disc.replacementNeeded,
          aspectRatio: match.aspectRatio || disc.aspectRatio,
        }
      : disc;
  });
}

function mergeCollectorMetadata(existing: Record<string, any>, generated: Record<string, any>) {
  const merged = {
    ...existing,
    ...generated,
  };

  const existingEdition = existing.edition && typeof existing.edition === "object" ? existing.edition : {};
  const generatedEdition = generated.edition && typeof generated.edition === "object" ? generated.edition : {};

  if (Object.keys(existingEdition).length > 0 || Object.keys(generatedEdition).length > 0) {
    merged.edition = {
      ...existingEdition,
      ...generatedEdition,
    };
  }

  const expectedFormats = merged.edition?.formats || generated.detected_formats || [];
  const expectedDiscCount = merged.edition?.disc_count || generated.edition?.disc_count || null;
  merged.discs = mergeDiscEntries(existing.discs, expectedFormats, expectedDiscCount);

  if (existing.slipcover_status && generated.slipcover_status === "unknown") {
    merged.slipcover_status = existing.slipcover_status;
  }

  if (existing.digital_code_status && generated.digital_code_status === "Unknown") {
    merged.digital_code_status = existing.digital_code_status;
  }

  return merged;
}

function buildSingleUpdatePayload(existing: DbMediaItem, result: MediaLookupResult) {
  const generatedMeta = buildLookupMetadata(result);
  const metadata = mergeCollectorMetadata((existing.metadata as Record<string, any>) || {}, generatedMeta);
  const externalId = getLookupExternalId({
    tmdb_id: result.tmdb_id || null,
    media_type: result.media_type || null,
    tmdb_series_id: result.tmdb_series_id || null,
    season_number: result.season_number || null,
  });
  const nextFormats = result.detected_formats?.length
    ? result.detected_formats
    : existing.formats || (existing.format ? [existing.format] : []);

  return {
    title: result.title || existing.title,
    year: result.year ?? existing.year,
    genre: result.genre ?? existing.genre,
    poster_url: hasManualArtworkOverride(existing.metadata)
      ? existing.poster_url
      : (result.cover_url || existing.poster_url),
    external_id: externalId || existing.external_id,
    formats: nextFormats,
    format: nextFormats[0] || existing.format,
    metadata,
  };
}

function buildEditionMetadata(productTitle: string, barcodeTitle: string, formats: string[], coverArtUrl: string | null | undefined, discCount: number | null | undefined, label: string | null | undefined, digitalCodeExpected: boolean | null | undefined, slipcoverExpected: boolean | null | undefined) {
  return {
    edition: {
      label: label || undefined,
      package_title: productTitle,
      barcode_title: barcodeTitle,
      formats,
      cover_art_url: coverArtUrl || null,
      disc_count: discCount || null,
      digital_code_expected: digitalCodeExpected ?? formats.includes("Digital"),
      slipcover_expected: slipcoverExpected ?? null,
    },
    discs: buildDiscEntries(formats, discCount || null),
    slipcover_status: slipcoverExpected === false ? "not_included" : "unknown",
    digital_code_status: (digitalCodeExpected ?? formats.includes("Digital")) ? "Unknown" : "Not Included",
  };
}

function buildMultiMovieLookup(movie: MultiMovieResult["movies"][number], result: MultiMovieResult): MediaLookupResult {
  const productTitle = result.collection_name || result.product_title;
  return {
    id: movie.tmdb_id ? String(movie.tmdb_id) : movie.title,
    tmdb_id: movie.tmdb_id || null,
    title: movie.title,
    year: movie.year || null,
    cover_url: movie.poster_url || null,
    genre: movie.genre || null,
    runtime: movie.runtime || null,
    tagline: movie.tagline || null,
    overview: movie.overview || null,
    cast: movie.cast,
    crew: movie.crew,
    detected_formats: result.detected_formats,
    media_type: "movie",
    edition: {
      label: result.edition_label || undefined,
      barcode_title: result.barcode_title,
      package_title: productTitle,
      formats: result.detected_formats,
      cover_art_url: result.cover_art_url || null,
      tmdb_poster_url: movie.poster_url || null,
      disc_count: result.disc_count || result.movies.length,
      digital_code_expected: result.digital_code_expected ?? result.detected_formats.includes("Digital"),
      slipcover_expected: result.slipcover_expected ?? null,
    },
  };
}

function buildMultiSeasonLookup(season: MultiSeasonResult["seasons"][number], result: MultiSeasonResult): MediaLookupResult {
  return {
    id: `${result.tmdb_series_id}:${season.season_number}`,
    tmdb_id: null,
    title: season.title,
    year: season.year || null,
    cover_url: season.poster_url || null,
    genre: season.genre || null,
    overview: season.overview || null,
    detected_formats: result.detected_formats,
    media_type: "tv_season",
    tmdb_series_id: result.tmdb_series_id,
    season_number: season.season_number,
    series_title: result.show_name,
    show_name: result.show_name,
    episode_count: season.episode_count || null,
    edition: {
      label: result.edition_label || undefined,
      barcode_title: result.barcode_title,
      package_title: result.product_title,
      formats: result.detected_formats,
      cover_art_url: result.cover_art_url || null,
      tmdb_poster_url: season.poster_url || null,
      disc_count: result.disc_count || result.seasons.length,
      digital_code_expected: result.digital_code_expected ?? result.detected_formats.includes("Digital"),
      slipcover_expected: result.slipcover_expected ?? null,
    },
  };
}

async function fetchBarcodedMediaItems(userId: string) {
  let from = 0;
  const pageSize = 1000;
  const all: DbMediaItem[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("media_items")
      .select("*")
      .eq("user_id", userId)
      .in("media_type", BARCODE_MEDIA_TYPES)
      .not("barcode", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as DbMediaItem[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function fetchBarcodedPhysicalProducts(userId: string) {
  let from = 0;
  const pageSize = 1000;
  const all: DbPhysicalProduct[] = [];

  while (true) {
    const { data, error } = await supabase
      .from("physical_products")
      .select("*")
      .eq("user_id", userId)
      .in("media_type", BARCODE_MEDIA_TYPES)
      .not("barcode", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as DbPhysicalProduct[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  return all;
}

async function fetchCopiesForProducts(productIds: string[]) {
  if (productIds.length === 0) return [] as DbMediaCopy[];

  const { data, error } = await supabase
    .from("media_copies")
    .select("*")
    .in("physical_product_id", productIds);

  if (error) throw error;
  return (data || []) as DbMediaCopy[];
}

async function fetchItemsByIds(itemIds: string[]) {
  if (itemIds.length === 0) return [] as DbMediaItem[];

  const { data, error } = await supabase
    .from("media_items")
    .select("*")
    .in("id", itemIds);

  if (error) throw error;
  return (data || []) as DbMediaItem[];
}

function groupBarcodeScopes(products: DbPhysicalProduct[], copies: DbMediaCopy[], linkedItems: DbMediaItem[], standaloneItems: DbMediaItem[]) {
  const scopes = new Map<string, BarcodeScope>();
  const itemMap = new Map(linkedItems.map((item) => [item.id, item]));
  const copiesByProduct = new Map<string, DbMediaCopy[]>();

  for (const copy of copies) {
    const bucket = copiesByProduct.get(copy.physical_product_id) || [];
    bucket.push(copy);
    copiesByProduct.set(copy.physical_product_id, bucket);
  }

  for (const product of products) {
    if (!product.barcode) continue;
    const key = `${product.media_type}:${product.barcode}`;
    const scope = scopes.get(key) || {
      barcode: product.barcode,
      mediaType: product.media_type as MediaTab,
      products: [],
      copies: [],
      linkedItems: [],
      standaloneItems: [],
    };

    scope.products.push(product);
    const productCopies = copiesByProduct.get(product.id) || [];
    scope.copies.push(...productCopies);
    for (const copy of productCopies) {
      const item = itemMap.get(copy.media_item_id);
      if (item && !scope.linkedItems.some((entry) => entry.id === item.id)) {
        scope.linkedItems.push(item);
      }
    }

    scopes.set(key, scope);
  }

  for (const item of standaloneItems) {
    if (!item.barcode) continue;
    const key = `${item.media_type}:${item.barcode}`;
    const scope = scopes.get(key) || {
      barcode: item.barcode,
      mediaType: item.media_type as MediaTab,
      products: [],
      copies: [],
      linkedItems: [],
      standaloneItems: [],
    };
    if (!scope.standaloneItems.some((entry) => entry.id === item.id)) {
      scope.standaloneItems.push(item);
    }
    scopes.set(key, scope);
  }

  return [...scopes.values()];
}

async function updatePhysicalProducts(products: DbPhysicalProduct[], updates: Partial<DbPhysicalProduct>) {
  for (const product of products) {
    const { error } = await supabase
      .from("physical_products")
      .update(updates)
      .eq("id", product.id);
    if (error) throw error;
  }
}

async function updateMediaItem(itemId: string, updates: Partial<DbMediaItem>) {
  const { error } = await supabase
    .from("media_items")
    .update(updates)
    .eq("id", itemId);
  if (error) throw error;
}

async function insertMediaCopy(physicalProductId: string, mediaItemId: string, format: string | null, discLabel?: string | null) {
  const { error } = await supabase
    .from("media_copies")
    .insert({
      physical_product_id: physicalProductId,
      media_item_id: mediaItemId,
      format,
      disc_label: discLabel || null,
    } as any);

  if (error && !String(error.message).includes("duplicate")) throw error;
}

async function deleteMediaCopies(copyIds: string[]) {
  if (copyIds.length === 0) return;
  const { error } = await supabase
    .from("media_copies")
    .delete()
    .in("id", copyIds);
  if (error) throw error;
}

async function deletePhysicalProducts(productIds: string[]) {
  if (productIds.length === 0) return;
  const { error } = await supabase
    .from("physical_products")
    .delete()
    .in("id", productIds);
  if (error) throw error;
}

async function createPhysicalProduct(userId: string, scope: BarcodeScope, productTitle: string, formats: string[], discCount: number, metadata: Record<string, any>, editionLabel?: string | null) {
  const { data, error } = await supabase
    .from("physical_products")
    .insert({
      user_id: userId,
      barcode: scope.barcode,
      product_title: productTitle,
      formats,
      edition: editionLabel || null,
      media_type: scope.mediaType,
      is_multi_title: true,
      disc_count: discCount,
      metadata,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as DbPhysicalProduct;
}

function findBestExistingItem(pool: DbMediaItem[], tmdbId: number | null, externalId: string | null, title: string) {
  const normalizedTitle = normalizeTitle(title);

  return pool.find((item) => tmdbId && item.external_id === String(tmdbId))
    || pool.find((item) => externalId && item.external_id === externalId)
    || pool.find((item) => normalizeTitle(item.title) === normalizedTitle)
    || null;
}

async function collapseDuplicateProducts(scope: BarcodeScope) {
  if (scope.products.length <= 1) return 0;

  const orderedProducts = [...scope.products].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const primary = orderedProducts[0];
  const extras = orderedProducts.slice(1);
  const primaryCopies = scope.copies.filter((copy) => copy.physical_product_id === primary.id);
  const linkedIds = new Set(primaryCopies.map((copy) => copy.media_item_id));

  for (const extra of extras) {
    const extraCopies = scope.copies.filter((copy) => copy.physical_product_id === extra.id);
    for (const copy of extraCopies) {
      if (!linkedIds.has(copy.media_item_id)) {
        await insertMediaCopy(primary.id, copy.media_item_id, copy.format, copy.disc_label);
        linkedIds.add(copy.media_item_id);
      }
    }
  }

  await deleteMediaCopies(
    scope.copies
      .filter((copy) => extras.some((product) => product.id === copy.physical_product_id))
      .map((copy) => copy.id),
  );
  await deletePhysicalProducts(extras.map((product) => product.id));

  scope.products = [primary];
  scope.copies = await fetchCopiesForProducts([primary.id]);
  return extras.length;
}

async function syncDirectScope(scope: BarcodeScope, result: MediaLookupResult) {
  const candidates = scope.linkedItems.length > 0 ? scope.linkedItems : scope.standaloneItems;

  for (const item of candidates) {
    const payload = buildSingleUpdatePayload(item, result);
    await updateMediaItem(item.id, payload);
  }

  if (scope.products.length > 0) {
    const productMetadata = mergeCollectorMetadata(
      (scope.products[0].metadata as Record<string, any>) || {},
      buildLookupMetadata(result),
    );

    await updatePhysicalProducts(scope.products, {
      product_title: result.edition?.package_title || result.title,
      formats: result.detected_formats?.length ? result.detected_formats : scope.products[0].formats,
      disc_count: result.edition?.disc_count || productMetadata.edition?.disc_count || scope.products[0].disc_count,
      edition: result.edition?.label || null,
      metadata: productMetadata,
      is_multi_title: false,
    } as any);
  }

  return { updated: candidates.length + scope.products.length, created: 0, linked: 0 };
}

async function syncMultiMovieScope(userId: string, scope: BarcodeScope, result: MultiMovieResult) {
  const pool = [...scope.linkedItems, ...scope.standaloneItems];
  const remaining = [...pool];
  const productTitle = result.collection_name || result.product_title;
  const productMetadata = buildEditionMetadata(
    productTitle,
    result.barcode_title,
    result.detected_formats,
    result.cover_art_url || null,
    result.disc_count || result.movies.length,
    result.edition_label || null,
    result.digital_code_expected ?? result.detected_formats.includes("Digital"),
    result.slipcover_expected ?? null,
  );

  let products = scope.products;
  let created = 0;
  let updated = 0;
  let linked = 0;

  if (products.length === 0) {
    const product = await createPhysicalProduct(
      userId,
      scope,
      productTitle,
      result.detected_formats,
      result.disc_count || result.movies.length,
      productMetadata,
      result.edition_label || null,
    );
    products = [product];
    created += 1;
  } else {
    await updatePhysicalProducts(products, {
      product_title: productTitle,
      formats: result.detected_formats,
      edition: result.edition_label || null,
      disc_count: result.disc_count || result.movies.length,
      metadata: mergeCollectorMetadata((products[0].metadata as Record<string, any>) || {}, productMetadata),
      is_multi_title: true,
    } as any);
    updated += products.length;
  }

  const targetIds: string[] = [];

  for (const movie of result.movies) {
    const lookup = buildMultiMovieLookup(movie, result);
    const externalId = movie.tmdb_id ? String(movie.tmdb_id) : null;
    const existing = findBestExistingItem(remaining, movie.tmdb_id || null, externalId, movie.title);
    if (existing) {
      const payload = buildSingleUpdatePayload(existing, lookup);
      await updateMediaItem(existing.id, {
        ...payload,
        barcode: null,
      });
      targetIds.push(existing.id);
      updated += 1;
      const index = remaining.findIndex((entry) => entry.id === existing.id);
      if (index >= 0) remaining.splice(index, 1);
    } else {
      const payload = buildSingleUpdatePayload(
        {
          id: "",
          title: movie.title,
          year: movie.year,
          genre: movie.genre || null,
          poster_url: movie.poster_url || null,
          external_id: null,
          format: null,
          formats: [],
          metadata: {},
          barcode: null,
          notes: null,
          in_plex: false,
          digital_copy: false,
          wishlist: false,
          want_to_watch: false,
          last_watched: null,
          watch_notes: null,
          sort_title: null,
          rating: null,
          media_type: scope.mediaType,
          user_id: userId,
          created_at: "",
          updated_at: "",
        } as DbMediaItem,
        lookup,
      );

      const { data, error } = await supabase
        .from("media_items")
        .insert({
          user_id: userId,
          media_type: scope.mediaType,
          barcode: null,
          ...payload,
        } as any)
        .select()
        .single();

      if (error) throw error;
      targetIds.push(data.id);
      created += 1;
    }
  }

  const existingLinks = products.flatMap((product) =>
    scope.copies.filter((copy) => copy.physical_product_id === product.id),
  );

  const staleCopyIds = existingLinks
    .filter((copy) => !targetIds.includes(copy.media_item_id))
    .map((copy) => copy.id);

  await deleteMediaCopies(staleCopyIds);

  for (const product of products) {
    const productCopies = scope.copies.filter((copy) => copy.physical_product_id === product.id);
    const linkedIds = new Set(productCopies.map((copy) => copy.media_item_id));
    for (const targetId of targetIds) {
      if (!linkedIds.has(targetId)) {
        await insertMediaCopy(product.id, targetId, result.detected_formats[0] || null);
        linked += 1;
      }
    }
  }

  return { updated, created, linked };
}

async function syncMultiSeasonScope(userId: string, scope: BarcodeScope, result: MultiSeasonResult) {
  const pool = [...scope.linkedItems, ...scope.standaloneItems];
  const remaining = [...pool];
  const productMetadata = buildEditionMetadata(
    result.product_title,
    result.barcode_title,
    result.detected_formats,
    result.cover_art_url || null,
    result.disc_count || result.seasons.length,
    result.edition_label || null,
    result.digital_code_expected ?? result.detected_formats.includes("Digital"),
    result.slipcover_expected ?? null,
  );

  let products = scope.products;
  let created = 0;
  let updated = 0;
  let linked = 0;

  if (products.length === 0) {
    const product = await createPhysicalProduct(
      userId,
      scope,
      result.product_title,
      result.detected_formats,
      result.disc_count || result.seasons.length,
      productMetadata,
      result.edition_label || null,
    );
    products = [product];
    created += 1;
  } else {
    await updatePhysicalProducts(products, {
      product_title: result.product_title,
      formats: result.detected_formats,
      edition: result.edition_label || null,
      disc_count: result.disc_count || result.seasons.length,
      metadata: mergeCollectorMetadata((products[0].metadata as Record<string, any>) || {}, productMetadata),
      is_multi_title: true,
    } as any);
    updated += products.length;
  }

  const targetIds: string[] = [];

  for (const season of result.seasons) {
    const lookup = buildMultiSeasonLookup(season, result);
    const externalId = `${result.tmdb_series_id}:${season.season_number}`;
    const existing = findBestExistingItem(remaining, null, externalId, season.title);

    if (existing) {
      const payload = buildSingleUpdatePayload(existing, lookup);
      await updateMediaItem(existing.id, {
        ...payload,
        barcode: null,
      });
      targetIds.push(existing.id);
      updated += 1;
      const index = remaining.findIndex((entry) => entry.id === existing.id);
      if (index >= 0) remaining.splice(index, 1);
    } else {
      const payload = buildSingleUpdatePayload(
        {
          id: "",
          title: season.title,
          year: season.year,
          genre: season.genre || null,
          poster_url: season.poster_url || null,
          external_id: null,
          format: null,
          formats: [],
          metadata: {},
          barcode: null,
          notes: null,
          in_plex: false,
          digital_copy: false,
          wishlist: false,
          want_to_watch: false,
          last_watched: null,
          watch_notes: null,
          sort_title: null,
          rating: null,
          media_type: scope.mediaType,
          user_id: userId,
          created_at: "",
          updated_at: "",
        } as DbMediaItem,
        lookup,
      );

      const { data, error } = await supabase
        .from("media_items")
        .insert({
          user_id: userId,
          media_type: scope.mediaType,
          barcode: null,
          ...payload,
        } as any)
        .select()
        .single();

      if (error) throw error;
      targetIds.push(data.id);
      created += 1;
    }
  }

  const existingLinks = products.flatMap((product) =>
    scope.copies.filter((copy) => copy.physical_product_id === product.id),
  );
  const staleCopyIds = existingLinks
    .filter((copy) => !targetIds.includes(copy.media_item_id))
    .map((copy) => copy.id);

  await deleteMediaCopies(staleCopyIds);

  for (const product of products) {
    const productCopies = scope.copies.filter((copy) => copy.physical_product_id === product.id);
    const linkedIds = new Set(productCopies.map((copy) => copy.media_item_id));
    for (const season of result.seasons) {
      const externalId = `${result.tmdb_series_id}:${season.season_number}`;
      const itemId = targetIds.find((targetId) => {
        const match = scope.linkedItems.find((item) => item.id === targetId)
          || remaining.find((item) => item.id === targetId);
        return match?.external_id === externalId || normalizeTitle(match?.title) === normalizeTitle(season.title);
      });
      const fallbackId = targetIds[result.seasons.findIndex((entry) => entry.season_number === season.season_number)];
      const resolvedId = itemId || fallbackId;
      if (resolvedId && !linkedIds.has(resolvedId)) {
        await insertMediaCopy(product.id, resolvedId, result.detected_formats[0] || null, `Season ${season.season_number}`);
        linked += 1;
      }
    }
  }

  return { updated, created, linked };
}

export async function reapplyBarcodeDetailsForUser(userId: string, options: ReapplyOptions = {}): Promise<ReapplyStats> {
  const stats: ReapplyStats = {
    scanned: 0,
    updated: 0,
    created: 0,
    linked: 0,
    skipped: 0,
    failures: 0,
  };

  const standaloneItems = await fetchBarcodedMediaItems(userId);
  const products = await fetchBarcodedPhysicalProducts(userId);
  const copies = await fetchCopiesForProducts(products.map((product) => product.id));
  const linkedItems = await fetchItemsByIds(dedupeStrings(copies.map((copy) => copy.media_item_id)));
  const scopes = groupBarcodeScopes(products, copies, linkedItems, standaloneItems);

  for (let index = 0; index < scopes.length; index += 1) {
    const scope = scopes[index];
    stats.scanned += 1;
    options.onProgress?.(`${index + 1}/${scopes.length} — checking ${scope.barcode}`);

    try {
      stats.updated += await collapseDuplicateProducts(scope);
      const result = await lookupBarcode(scope.mediaType, scope.barcode);

      if (result.direct) {
        const outcome = await syncDirectScope(scope, result.direct);
        stats.updated += outcome.updated;
        stats.created += outcome.created;
        stats.linked += outcome.linked;
      } else if (result.multiMovie) {
        const outcome = await syncMultiMovieScope(userId, scope, result.multiMovie);
        stats.updated += outcome.updated;
        stats.created += outcome.created;
        stats.linked += outcome.linked;
      } else if (result.multiSeason) {
        const outcome = await syncMultiSeasonScope(userId, scope, result.multiSeason);
        stats.updated += outcome.updated;
        stats.created += outcome.created;
        stats.linked += outcome.linked;
      } else {
        stats.skipped += 1;
      }
    } catch {
      stats.failures += 1;
    }

    if (index < scopes.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return stats;
}
