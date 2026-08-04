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

function readCachedJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeCachedJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore local cache failures.
  }
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
      const cacheKey = `discstacked:public-profile:${shareToken}`;
      try {
        // Token validation happens server-side inside the RPC (SECURITY DEFINER,
        // matches on share_token) rather than via a client-filtered table select —
        // direct RLS on `profiles` is owner-only now, this is the only public read path.
        const { data, error } = await (supabase.rpc as any)("get_shared_profile", {
          p_token: shareToken,
        }).maybeSingle();
        if (error) throw error;
        if (!data) throw new Error("Collection not found");
        writeCachedJson(cacheKey, data);
        return data as Profile;
      } catch (error) {
        const cached = readCachedJson<Profile>(cacheKey);
        if (cached) return cached;
        throw error;
      }
    },
    enabled: !!shareToken,
  });
}

export function usePublicCollection(shareToken: string | undefined, mediaType?: string) {
  return useQuery({
    queryKey: ["public-collection", shareToken, mediaType],
    queryFn: async () => {
      if (!shareToken) return null;
      const cacheKey = `discstacked:public-collection:${shareToken}:${mediaType || "all"}`;
      try {
        const PAGE_SIZE = 1000;
        let allData: any[] = [];
        let from = 0;

        while (true) {
          // Same server-side token validation as get_shared_profile above — the RPC
          // also enforces the owner's opted-in shared_tabs, which was previously only
          // enforced client-side.
          const { data, error } = await (supabase.rpc as any)("get_shared_media_items", {
            p_token: shareToken,
            p_media_type: mediaType ?? null,
          })
            .order("title")
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allData = allData.concat(data);
          if (data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }

        writeCachedJson(cacheKey, allData);
        return allData;
      } catch (error) {
        const cached = readCachedJson<any[]>(cacheKey);
        if (cached) return cached;
        throw error;
      }
    },
    enabled: !!shareToken,
  });
}
