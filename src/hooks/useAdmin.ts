import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  item_count: number;
  roles: string[];
}

export function useAdmin() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminExists, setAdminExists] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    const checkRole = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin");
      
      setIsAdmin(!!data && data.length > 0);
      setLoading(false);
    };

    checkRole();
  }, [user]);

  const checkAdminExists = async () => {
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("id")
        .eq("role", "admin")
        .limit(1);
      const exists = !!data && data.length > 0;
      setAdminExists(exists);
      return exists;
    } catch {
      // If RLS blocks, assume no admin or user can't see
      setAdminExists(null);
      return null;
    }
  };

  const setupAdmin = async (password: string) => {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "setup-admin", password },
    });
    if (error) throw error;
    if (data.error) throw new Error(data.error);
    setIsAdmin(true);
    return data;
  };

  const listUsers = async (): Promise<AdminUser[]> => {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "list-users" },
    });
    if (error) throw error;
    if (data.error) throw new Error(data.error);
    return data.users;
  };

  const deleteUser = async (targetUserId: string) => {
    const { data, error } = await supabase.functions.invoke("admin-users", {
      body: { action: "delete-user", targetUserId },
    });
    if (error) throw error;
    if (data.error) throw new Error(data.error);
    return data;
  };

  return { isAdmin, loading, adminExists, checkAdminExists, setupAdmin, listUsers, deleteUser };
}
