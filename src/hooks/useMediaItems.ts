import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab } from "@/lib/types";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type DbMediaItem = Tables<"media_items">;

export function useMediaItems(activeTab: MediaTab) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["media_items", activeTab, user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("media_items")
        .select("*")
        .eq("user_id", user.id)
        .eq("media_type", activeTab)
        .order("title");

      if (error) throw error;
      return data as DbMediaItem[];
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

      // If replacing, delete existing items for this media type
      if (replace) {
        const { error: delError } = await supabase
          .from("media_items")
          .delete()
          .eq("user_id", user.id)
          .eq("media_type", mediaType);
        if (delError) throw delError;
      }

      // Insert new items
      const rows = items.map((item) => ({
        ...item,
        user_id: user.id,
        media_type: mediaType,
        title: item.title || "Untitled",
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
