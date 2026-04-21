import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab } from "@/lib/types";
import type { Json, Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { upsertEditionCatalogSeeds } from "@/lib/edition-catalog";
import { buildImportIdentityKeys } from "@/lib/import-utils";

export type DbMediaItem = Tables<"media_items">;

async function fetchAllItems(userId: string, mediaType: MediaTab): Promise<DbMediaItem[]> {
  const PAGE_SIZE = 1000;
  let allData: DbMediaItem[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("media_items")
      .select("*")
      .eq("user_id", userId)
      .eq("media_type", mediaType)
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

      if (replace) {
        const { error: delError } = await supabase
          .from("media_items")
          .delete()
          .eq("user_id", user.id)
          .eq("media_type", mediaType);
        if (delError) throw delError;
      }

      const rows = items.map((item) => ({
        ...item,
        user_id: user.id,
        media_type: mediaType,
        title: item.title || "Untitled",
        formats: item.formats || (item.format ? [item.format] : []),
      }));

      const rowsForCatalog: Partial<TablesInsert<"media_items">>[] = [];

      if (replace) {
        for (let i = 0; i < rows.length; i += 500) {
          const chunk = rows.slice(i, i + 500);
          const { error } = await supabase.from("media_items").insert(chunk);
          if (error) throw error;
          rowsForCatalog.push(...chunk);
        }
      } else {
        const existingItems = await fetchAllItems(user.id, mediaType);
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
        const updatesToApply: { id: string; data: TablesUpdate<"media_items"> }[] = [];

        if (mediaType === "cds") {
          rowsToInsert.push(...rows);
          rowsForCatalog.push(...rows);
        } else {
          for (const row of rows) {
            const keys = buildImportIdentityKeys(row as Record<string, any>, mediaType);
            const existing = keys.map((key) => existingByIdentity.get(key)).find(Boolean);

            if (existing) {
              const merged = mergeImportedRowIntoExisting(existing, row, mediaType);
              updatesToApply.push({ id: existing.id, data: merged });
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

        for (let i = 0; i < updatesToApply.length; i += 100) {
          const chunk = updatesToApply.slice(i, i + 100);
          await Promise.all(chunk.map(async ({ id, data }) => {
            const { error } = await supabase.from("media_items").update(data).eq("id", id);
            if (error) throw error;
          }));
        }

        for (let i = 0; i < rowsToInsert.length; i += 500) {
          const chunk = rowsToInsert.slice(i, i + 500);
          const { error } = await supabase.from("media_items").insert(chunk);
          if (error) throw error;
        }
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
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
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
