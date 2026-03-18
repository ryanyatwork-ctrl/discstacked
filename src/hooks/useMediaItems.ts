import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab } from "@/lib/types";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

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
