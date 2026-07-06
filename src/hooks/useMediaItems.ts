import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab, dbMediaTypesForTab } from "@/lib/types";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { upsertEditionCatalogSeeds } from "@/lib/edition-catalog";
import { buildImportIdentityKeys } from "@/lib/import-utils";
import { buildMusicMediaMirrorRow } from "@/lib/music-media-mirror";

export type DbMediaItem = Tables<"media_items">;

async function fetchAllItems(userId: string, mediaType: MediaTab): Promise<DbMediaItem[]> {
  const PAGE_SIZE = 1000;
  let allData: DbMediaItem[] = [];
  let from = 0;

  // The TV tab holds both "tv" (whole-show) and "tv-season" rows; every other
  // tab maps to a single db media_type. dbMediaTypesForTab encodes that.
  const dbTypes = dbMediaTypesForTab(mediaType);

  while (true) {
    const { data, error } = await supabase
      .from("media_items")
      .select("*")
      .eq("user_id", userId)
      .in("media_type", dbTypes)
      .order("title")
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allData = allData.concat(data as DbMediaItem[]);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function asRecord(value: Json | null | undefined): Record<string, any> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as Record<string, any>;
}

function mergeImportedMetadata(
  existing: Record<string, any>,
  incoming: Record<string, any>,
  mediaType: MediaTab,
  mergedFormats: string[],
) {
  const next = {
    ...existing,
    ...incoming,
  };

  if (mediaType === "games") {
    const mergedPlatforms = uniqueStrings([
      existing.platform,
      existing.platforms,
      incoming.platform,
      incoming.platforms,
      mergedFormats,
    ]);

    if (mergedPlatforms.length > 0) {
      next.platforms = mergedPlatforms;
      if (!next.platform) next.platform = mergedPlatforms[0];
    }

    const mergedSources = uniqueStrings([
      existing.sources,
      existing.source,
      incoming.sources,
      incoming.source,
    ]);

    if (mergedSources.length > 1) {
      next.sources = mergedSources;
    }

    next.source = incoming.source || existing.source || "import";
  }

  if (mediaType === "cds") {
    next.artist = incoming.artist || existing.artist;
    next.label = incoming.label || existing.label;
  }

  return next;
}

function mergeImportedRowIntoExisting(
  existing: DbMediaItem,
  incoming: Partial<TablesInsert<"media_items">>,
  mediaType: MediaTab,
): TablesUpdate<"media_items"> {
  const existingFormats = uniqueStrings([existing.formats || [], existing.format || ""]);
  const incomingFormats = uniqueStrings([incoming.formats || [], incoming.format || ""]);
  const mergedFormats = uniqueStrings([existingFormats, incomingFormats]);
  const mergedMetadata = mergeImportedMetadata(
    asRecord(existing.metadata),
    asRecord((incoming.metadata as Json | null) || null),
    mediaType,
    mergedFormats,
  );

  return {
    title: incoming.title || existing.title,
    year: incoming.year ?? existing.year,
    genre: incoming.genre || existing.genre,
    rating: incoming.rating ?? existing.rating,
    notes: incoming.notes || existing.notes,
    barcode: incoming.barcode || existing.barcode,
    format: mergedFormats[0] || incoming.format || existing.format,
    formats: mergedFormats,
    poster_url: existing.poster_url || incoming.poster_url || null,
    metadata: mergedMetadata as Json,
  };
}

/**
 * For every inserted media_item, create a matching physical_product + media_copy
 * so the item is never an orphan. This is what the original implementation was
 * missing — every imported row used to land in media_items only, generating
 * thousands of orphans in the April 2026 CSV import.
 *
 * Done in chunks parallel to the media_items inserts, so the IDs line up.
 */
async function createProductsAndCopiesForRows(
  userId: string,
  insertedItems: DbMediaItem[],
): Promise<void> {
  if (insertedItems.length === 0) return;

  // Build a physical_product row for each media_item.
  const productRows = insertedItems.map((item) => {
    const meta = asRecord(item.metadata);
    const editionMeta = (meta.edition && typeof meta.edition === "object") ? meta.edition : {};
    const productTitle = editionMeta.package_title || editionMeta.barcode_title || item.title || "Untitled";
    const editionLabel = typeof editionMeta.label === "string" ? editionMeta.label : null;

    return {
      user_id: userId,
      barcode: item.barcode || null,
      product_title: productTitle,
      formats: item.formats || (item.format ? [item.format] : []),
      media_type: item.media_type,
      edition: editionLabel,
      is_multi_title: false,
      disc_count: editionMeta.disc_count || meta.disc_count || 1,
      metadata: meta as Json,
    };
  });

  // Bulk insert physical_products in matching chunks.
  const PRODUCT_CHUNK = 500;
  const insertedProductIds: string[] = [];

  for (let i = 0; i < productRows.length; i += PRODUCT_CHUNK) {
    const chunk = productRows.slice(i, i + PRODUCT_CHUNK);
    const { data, error } = await supabase
      .from("physical_products")
      .insert(chunk as any)
      .select("id");

    if (error) throw error;
    if (!data || data.length !== chunk.length) {
      throw new Error(
        `physical_products insert returned ${data?.length ?? 0} rows for ${chunk.length} requested — refusing to proceed and create misaligned media_copies`,
      );
    }
    insertedProductIds.push(...data.map((d) => d.id));
  }

  // Build media_copies linking each media_item to its product.
  const copyRows = insertedItems.map((item, i) => ({
    media_item_id: item.id,
    physical_product_id: insertedProductIds[i],
    format: item.format || (item.formats && item.formats.length > 0 ? item.formats[0] : null),
  }));

  // Bulk insert media_copies.
  const COPY_CHUNK = 1000;
  for (let i = 0; i < copyRows.length; i += COPY_CHUNK) {
    const chunk = copyRows.slice(i, i + COPY_CHUNK);
    const { error } = await supabase.from("media_copies").insert(chunk as any);
    if (error) throw error;
  }
}

/**
 * For an EXISTING media_item that's about to be updated (merge mode), make sure
 * it has at least one media_copy. If it doesn't, it's a legacy orphan — create
 * a physical_product + media_copy now so it stops being one.
 */
async function ensureCopyExistsForExistingItem(
  userId: string,
  item: DbMediaItem,
  mergedUpdate: TablesUpdate<"media_items">,
): Promise<void> {
  // Cheap check first — does this item have any copy already?
  const { count, error: countError } = await supabase
    .from("media_copies")
    .select("id", { count: "exact", head: true })
    .eq("media_item_id", item.id);

  if (countError) throw countError;
  if ((count ?? 0) > 0) return; // already linked, nothing to do

  // Orphan — create a product + copy using the merged values.
  const meta = asRecord((mergedUpdate.metadata as Json | null) || item.metadata);
  const editionMeta = (meta.edition && typeof meta.edition === "object") ? meta.edition : {};
  const formats = (mergedUpdate.formats as string[] | undefined) || item.formats || [];
  const format = (mergedUpdate.format as string | undefined) || item.format || formats[0] || null;
  const productTitle = editionMeta.package_title || editionMeta.barcode_title || mergedUpdate.title || item.title || "Untitled";

  const { data: pp, error: ppError } = await supabase
    .from("physical_products")
    .insert({
      user_id: userId,
      barcode: (mergedUpdate.barcode as string | null) ?? item.barcode ?? null,
      product_title: productTitle,
      formats,
      media_type: item.media_type,
      edition: typeof editionMeta.label === "string" ? editionMeta.label : null,
      is_multi_title: false,
      disc_count: editionMeta.disc_count || meta.disc_count || 1,
      metadata: meta as Json,
    } as any)
    .select("id")
    .single();

  if (ppError) throw ppError;

  const { error: mcError } = await supabase
    .from("media_copies")
    .insert({
      media_item_id: item.id,
      physical_product_id: pp.id,
      format,
    } as any);

  if (mcError) throw mcError;
}

async function insertMediaItemsWithMirrors(
  userId: string,
  rows: Partial<TablesInsert<"media_items">>[],
  mediaType: MediaTab,
) {
  const insertedRows: DbMediaItem[] = [];

  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { data, error } = await supabase.from("media_items").insert(chunk).select("*");
    if (error) throw error;
    insertedRows.push(...((data || []) as DbMediaItem[]));
  }

  // CRITICAL: create physical_products + media_copies so nothing is orphaned.
  await createProductsAndCopiesForRows(userId, insertedRows);

  if (mediaType === "cds") {
    const mirrorRows = insertedRows
      .map((row) => buildMusicMediaMirrorRow(userId, {
        sourceItemId: row.id,
        title: row.title,
        year: row.year,
        genre: row.genre,
        notes: row.notes,
        poster_url: row.poster_url,
        barcode: row.barcode,
        formats: row.formats,
        metadata: asRecord(row.metadata),
      }))
      .filter(Boolean) as TablesInsert<"media_items">[];

    if (mirrorRows.length > 0) {
      const insertedMirrors: DbMediaItem[] = [];
      for (let i = 0; i < mirrorRows.length; i += 500) {
        const chunk = mirrorRows.slice(i, i + 500);
        const { data, error } = await supabase.from("media_items").insert(chunk).select("*");
        if (error) throw error;
        insertedMirrors.push(...((data || []) as DbMediaItem[]));
      }
      // Mirrors also get products+copies so they don't show as orphans in music-films either.
      await createProductsAndCopiesForRows(userId, insertedMirrors);
    }
  }

  return insertedRows;
}

export function useMediaItems(activeTab: MediaTab) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["media_items", activeTab, user?.id],
    queryFn: async () => {
      if (!user) return [];
      return fetchAllItems(user.id, activeTab);
    },
    enabled: !!user,
  });
}

export function useImportItems() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      items,
      mediaType,
      replace,
    }: {
      items: Partial<TablesInsert<"media_items">>[];
      mediaType: MediaTab;
      replace: boolean;
    }) => {
      if (!user) throw new Error("Not authenticated");

      // The importer may route some rows to a different media_type than the
      // active tab (e.g. TV seasons detected inside a movie import get
      // "tv-season"). Honor that per-row override and strip the marker so it
      // never reaches the DB insert.
      const rows = items.map((item) => {
        const { _mediaTypeOverride, ...rest } = item as Record<string, any>;
        return {
          ...rest,
          user_id: user.id,
          media_type: (_mediaTypeOverride as string) || mediaType,
          title: rest.title || "Untitled",
          formats: rest.formats || (rest.format ? [rest.format] : []),
        } as Partial<TablesInsert<"media_items">>;
      });

      // Every media_type the import writes into — the active tab plus any
      // auto-routed types. Replace mode clears all of them so a re-import is a
      // clean slate (otherwise routed TV rows would pile up on each replace).
      const touchedTypes = Array.from(new Set<string>([mediaType, ...rows.map((r) => r.media_type as string)]));

      if (replace) {
        // Replace mode: nuke the touched types for the user, then rebuild.
        // media_copies cascade from media_items, but physical_products live
        // independently — wipe both explicitly to avoid leaving dangling products.
        const { data: oldProducts, error: oldProductsError } = await supabase
          .from("physical_products")
          .select("id")
          .eq("user_id", user.id)
          .in("media_type", touchedTypes);
        if (oldProductsError) throw oldProductsError;

        const { error: delError } = await supabase
          .from("media_items")
          .delete()
          .eq("user_id", user.id)
          .in("media_type", touchedTypes);
        if (delError) throw delError;

        if (oldProducts && oldProducts.length > 0) {
          const oldProductIds = oldProducts.map((p) => p.id);
          // Delete in chunks to avoid massive IN clauses
          for (let i = 0; i < oldProductIds.length; i += 500) {
            const chunk = oldProductIds.slice(i, i + 500);
            const { error: ppDelError } = await supabase
              .from("physical_products")
              .delete()
              .in("id", chunk);
            if (ppDelError) throw ppDelError;
          }
        }

        if (mediaType === "cds") {
          const { error: mirrorDeleteError } = await supabase
            .from("media_items")
            .delete()
            .eq("user_id", user.id)
            .eq("media_type", "music-films")
            .contains("metadata", { mirror_source_type: "cds" });
          if (mirrorDeleteError) throw mirrorDeleteError;
        }
      }

      const rowsForCatalog: Partial<TablesInsert<"media_items">>[] = [];

      if (replace) {
        const insertedRows = await insertMediaItemsWithMirrors(user.id, rows, mediaType);
        rowsForCatalog.push(...insertedRows);
      } else {
        // Dedup against existing items across every touched type so auto-routed
        // TV rows match existing TV items (not just the active tab's type).
        const existingItems: DbMediaItem[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await supabase
            .from("media_items")
            .select("*")
            .eq("user_id", user.id)
            .in("media_type", touchedTypes)
            .range(from, from + 999);
          if (error) throw error;
          if (!data || data.length === 0) break;
          existingItems.push(...(data as DbMediaItem[]));
          if (data.length < 1000) break;
        }
        const existingByIdentity = new Map<string, DbMediaItem>();

        for (const existing of existingItems) {
          for (const key of buildImportIdentityKeys({
            title: existing.title,
            year: existing.year,
            barcode: existing.barcode,
            format: existing.format,
            formats: existing.formats || [],
            metadata: asRecord(existing.metadata),
          }, mediaType)) {
            if (!existingByIdentity.has(key)) {
              existingByIdentity.set(key, existing);
            }
          }
        }

        const rowsToInsert: Partial<TablesInsert<"media_items">>[] = [];
        const updatesToApply: { existing: DbMediaItem; data: TablesUpdate<"media_items"> }[] = [];

        if (mediaType === "cds") {
          rowsToInsert.push(...rows);
        } else {
          for (const row of rows) {
            const keys = buildImportIdentityKeys(row as Record<string, any>, mediaType);
            const existing = keys.map((key) => existingByIdentity.get(key)).find(Boolean);

            if (existing) {
              const merged = mergeImportedRowIntoExisting(existing, row, mediaType);
              updatesToApply.push({ existing, data: merged });
              rowsForCatalog.push({
                ...existing,
                ...merged,
                media_type: mediaType,
                user_id: user.id,
              });
            } else {
              rowsToInsert.push(row);
              rowsForCatalog.push(row);
            }
          }
        }

        // Apply updates AND simultaneously ensure each matched item has a media_copy.
        // This auto-fixes legacy orphans for users re-importing into existing collections.
        for (let i = 0; i < updatesToApply.length; i += 100) {
          const chunk = updatesToApply.slice(i, i + 100);
          await Promise.all(chunk.map(async ({ existing, data }) => {
            const { error } = await supabase.from("media_items").update(data).eq("id", existing.id);
            if (error) throw error;
            // Backfill product+copy if this item is currently an orphan
            await ensureCopyExistsForExistingItem(user.id, existing, data);
          }));
        }

        const insertedRows = await insertMediaItemsWithMirrors(user.id, rowsToInsert, mediaType);
        rowsForCatalog.push(...insertedRows);
      }

      await upsertEditionCatalogSeeds(
        rowsForCatalog
          .filter((row) => Boolean(row.barcode))
          .map((row) => ({
            barcode: String(row.barcode),
            media_type: mediaType,
            title: row.title || "Untitled",
            year: row.year ?? null,
            external_id: row.external_id ?? null,
            product_title: (row.metadata as any)?.edition?.package_title || row.title || "Untitled",
            edition: (row.metadata as any)?.edition?.label || (row.metadata as any)?.edition || null,
            formats: row.formats || (row.format ? [row.format] : []),
            disc_count: (row.metadata as any)?.edition?.disc_count ?? (row.metadata as any)?.disc_count ?? null,
            package_image_url: (row.metadata as any)?.edition?.cover_art_url || row.poster_url || null,
            source: "import",
            source_confidence: 85,
            metadata: row.metadata as Record<string, any> | null,
          })),
      );

      return rows.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
      queryClient.invalidateQueries({ queryKey: ["physical_products_for_item"] });
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<DbMediaItem>) => {
      const { error } = await supabase
        .from("media_items")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
    },
  });
}

export function useDuplicateItem() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sourceItem: DbMediaItem) => {
      if (!user) throw new Error("Not authenticated");
      const { id, created_at, updated_at, ...rest } = sourceItem;
      const { data, error } = await supabase
        .from("media_items")
        .insert({ ...rest, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      // Give the duplicate its own physical_product + media_copy so it isn't an orphan.
      try {
        await createProductsAndCopiesForRows(user.id, [data as DbMediaItem]);
      } catch (err) {
        console.warn("Failed to create product/copy for duplicate:", err);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
      queryClient.invalidateQueries({ queryKey: ["physical_products_for_item"] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("media_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
    },
  });
}
