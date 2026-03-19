import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  share_token: string | null;
  shared_tabs: string[];
  created_at: string;
  updated_at: string;
}

export function useProfile() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!user,
  });

  const queryClient = useQueryClient();

  const updateProfile = useMutation({
    mutationFn: async (updates: { display_name?: string; avatar_url?: string; shared_tabs?: string[] }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("user_id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data as Profile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
  });

  const uploadAvatar = async (file: File): Promise<string> => {
    if (!user) throw new Error("Not authenticated");
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    return data.publicUrl;
  };

  return { profile, isLoading, updateProfile, uploadAvatar };
}

export function usePublicProfile(shareToken: string | undefined) {
  return useQuery({
    queryKey: ["public-profile", shareToken],
    queryFn: async () => {
      if (!shareToken) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("share_token", shareToken)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    enabled: !!shareToken,
  });
}

export function usePublicCollection(userId: string | undefined, mediaType?: string) {
  return useQuery({
    queryKey: ["public-collection", userId, mediaType],
    queryFn: async () => {
      if (!userId) return null;
      let query = supabase
        .from("media_items")
        .select("*")
        .eq("user_id", userId)
        .order("title");
      if (mediaType) {
        query = query.eq("media_type", mediaType);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}
