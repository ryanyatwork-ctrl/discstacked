import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// This project shares one Supabase database across DiscStacked, BookStacked and
// TV Tracker, each isolated in its own schema. Both clients MUST target the
// `discstacked` schema — without it they hit `public.user_roles`, which does
// not exist, so admin-status throws and every user silently looks non-admin.
const DB_SCHEMA = "discstacked";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      db: { schema: DB_SCHEMA },
      global: { headers: { Authorization: authHeader } },
    });
    const userResult = await userClient.auth.getUser();
    const currentUser = userResult.data?.user;

    if (userResult.error || !currentUser?.id) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = currentUser.id;
    const { action, targetUserId, password } = await req.json();

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      db: { schema: DB_SCHEMA },
    });

    if (action === "admin-status") {
      const [{ count: adminCount, error: adminCountError }, { data: roleData, error: roleError }] = await Promise.all([
        adminClient
          .from("user_roles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin"),
        adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle(),
      ]);

      if (adminCountError) throw adminCountError;
      if (roleError) throw roleError;

      return new Response(JSON.stringify({
        adminExists: (adminCount ?? 0) > 0,
        isAdmin: !!roleData,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list-users") {
      const { data: roleData, error: currentRoleError } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (currentRoleError) throw currentRoleError;

      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const users: any[] = [];
      let page = 1;
      const perPage = 200;
      let authListError: string | null = null;

      while (true) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (error) {
          authListError = error.message;
          break;
        }

        const batch = data?.users ?? [];
        users.push(...batch);

        if (batch.length < perPage) {
          break;
        }

        page += 1;
      }

      // Get profiles
      const { data: profiles, error: profilesError } = await adminClient.from("profiles").select("*");
      if (profilesError) throw profilesError;

      // Get item counts manually. Supabase/PostgREST caps a single select
      // at 1,000 rows by default, so page through the full table.
      const allItems: Array<{ user_id: string; id: string }> = [];
      const itemPageSize = 1000;
      for (let from = 0; ; from += itemPageSize) {
        const { data: itemBatch, error: itemError } = await adminClient
          .from("media_items")
          .select("user_id, id")
          .range(from, from + itemPageSize - 1);
        if (itemError) throw itemError;
        allItems.push(...((itemBatch ?? []) as Array<{ user_id: string; id: string }>));
        if (!itemBatch || itemBatch.length < itemPageSize) break;
      }

      const countMap: Record<string, number> = {};
      for (const item of allItems) {
        countMap[item.user_id] = (countMap[item.user_id] || 0) + 1;
      }

      // Get roles
      const { data: roles, error: rolesError } = await adminClient.from("user_roles").select("*");
      if (rolesError) throw rolesError;

      // Only surface users that actually belong to DiscStacked (they have a
      // profile, media items, or a role in this schema). This keeps the shared
      // BookStacked / TV Tracker accounts out of the DiscStacked admin list.
      const discstackedUserIds = new Set<string>();
      profiles?.forEach((profile: any) => {
        if (profile.user_id) discstackedUserIds.add(profile.user_id);
      });
      Object.keys(countMap).forEach((id) => discstackedUserIds.add(id));
      roles?.forEach((role: any) => {
        if (role.user_id) discstackedUserIds.add(role.user_id);
      });

      const enrichedUsers = Array.from(discstackedUserIds).map((id) => {
        const u = users.find((user: any) => user.id === id);
        const profile = profiles?.find((p: any) => p.user_id === id);
        const userRoles = roles?.filter((r: any) => r.user_id === id).map((r: any) => r.role) || [];
        return {
          id,
          email: u?.email ?? null,
          created_at: u?.created_at ?? profile?.created_at ?? null,
          last_sign_in_at: u?.last_sign_in_at ?? null,
          display_name: profile?.display_name || u?.raw_user_meta_data?.display_name || u?.raw_user_meta_data?.full_name || null,
          avatar_url: profile?.avatar_url || u?.raw_user_meta_data?.avatar_url || u?.raw_user_meta_data?.picture || null,
          item_count: countMap[id] || 0,
          roles: userRoles,
        };
      }).sort((a, b) => {
        if (b.item_count !== a.item_count) return b.item_count - a.item_count;
        return (a.email ?? "").localeCompare(b.email ?? "");
      });

      return new Response(JSON.stringify({ users: enrichedUsers }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          ...(authListError ? { "X-DiscStacked-Auth-List-Warning": authListError } : {}),
        },
      });
    }

    if (action === "debug-admin-list") {
      const { data: roleData, error: currentRoleError } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();

      if (currentRoleError) throw currentRoleError;
      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const [
        profilesResult,
        rolesResult,
        itemsResult,
        authResult,
      ] = await Promise.all([
        adminClient.from("profiles").select("user_id", { count: "exact", head: true }),
        adminClient.from("user_roles").select("user_id", { count: "exact", head: true }),
        adminClient.from("media_items").select("user_id", { count: "exact", head: true }),
        adminClient.auth.admin.listUsers({ page: 1, perPage: 1 }),
      ]);

      return new Response(JSON.stringify({
        currentUserId: userId,
        isAdmin: true,
        profiles: {
          count: profilesResult.count,
          error: profilesResult.error?.message ?? null,
        },
        roles: {
          count: rolesResult.count,
          error: rolesResult.error?.message ?? null,
        },
        mediaItems: {
          count: itemsResult.count,
          error: itemsResult.error?.message ?? null,
        },
        authUsers: {
          count: authResult.data?.users?.length ?? null,
          error: authResult.error?.message ?? null,
        },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-user") {
      if (!targetUserId) throw new Error("targetUserId required");

      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (targetUserId === userId) throw new Error("Cannot delete your own account");

      // Remove this user's DiscStacked data only. We intentionally do NOT call
      // auth.admin.deleteUser here: the auth account is shared with BookStacked
      // and TV Tracker, so deleting it would wipe those apps' users too.
      await adminClient.from("media_items").delete().eq("user_id", targetUserId);
      await adminClient.from("profiles").delete().eq("user_id", targetUserId);
      await adminClient.from("user_roles").delete().eq("user_id", targetUserId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "setup-admin") {
      // Special bootstrap: only works if NO admins exist yet
      const { data: existingAdmins } = await adminClient
        .from("user_roles")
        .select("id")
        .eq("role", "admin");

      if (existingAdmins && existingAdmins.length > 0) {
        return new Response(JSON.stringify({ error: "Admin already exists" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify setup password (stored as a secret)
      const setupPassword = Deno.env.get("ADMIN_SETUP_PASSWORD");
      if (!setupPassword || password !== setupPassword) {
        return new Response(JSON.stringify({ error: "Incorrect admin setup password" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Grant admin to the calling user
      const { error } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
