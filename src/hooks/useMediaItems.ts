import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab } from "@/lib/types";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { upsertEditionCatalogSeeds } from "@/lib/edition-catalog";

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

      // Batch in chunks of 500
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabase.from("media_items").insert(chunk);
        if (error) throw error;
      }

      await upsertEditionCatalogSeeds(
        rows
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
