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

  const invokeAdminUsers = async <T,>(body: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.functions.invoke("admin-users", { body });

    if (error) {
      const response = (error as { context?: Response }).context;

      if (response instanceof Response) {
        try {
          const payload = await response.clone().json();
          if (payload?.error) {
            throw new Error(payload.error);
          }
        } catch {
          try {
            const text = await response.text();
            if (text) {
              throw new Error(text);
            }
          } catch {
            // Fall through to default error below
          }
        }
      }

      throw error;
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    return data as T;
  };

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setAdminExists(null);
      setLoading(false);
      return;
    }

    const loadAdminStatus = async () => {
      try {
        const data = await invokeAdminUsers<{ isAdmin: boolean; adminExists: boolean }>({
          action: "admin-status",
        });

        setIsAdmin(data.isAdmin);
        setAdminExists(data.adminExists);
      } catch {
        setIsAdmin(false);
        setAdminExists(null);
      } finally {
        setLoading(false);
      }
    };

    loadAdminStatus();
  }, [user]);

  const checkAdminExists = async () => {
    try {
      const data = await invokeAdminUsers<{ adminExists: boolean }>({ action: "admin-status" });
      setAdminExists(data.adminExists);
      return data.adminExists;
    } catch {
      setAdminExists(null);
      return null;
    }
  };

  const setupAdmin = async (password: string) => {
    const data = await invokeAdminUsers<{ success: boolean }>({ action: "setup-admin", password });
    setIsAdmin(true);
    setAdminExists(true);
    return data;
  };

  const listUsers = async (): Promise<AdminUser[]> => {
    const data = await invokeAdminUsers<{ users: AdminUser[] }>({ action: "list-users" });
    return data.users;
  };

  const deleteUser = async (targetUserId: string) => {
    return invokeAdminUsers<{ success: boolean }>({ action: "delete-user", targetUserId });
  };

  return { isAdmin, loading, adminExists, checkAdminExists, setupAdmin, listUsers, deleteUser };
}
