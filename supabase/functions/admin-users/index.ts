import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const claimsResult = await userClient.auth.getClaims(token);
    const claims = claimsResult.data?.claims;

    if (claimsResult.error || !claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.sub;
    const { action, targetUserId, password, email, displayName } = await req.json();

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const requireAdmin = async () => {
      const { data: roleData } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .single();

      if (!roleData) {
        return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return null;
    };

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
      const adminError = await requireAdmin();
      if (adminError) return adminError;

      // Get all users from auth
      const { data: { users }, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw error;

      // Get profiles
      const { data: profiles } = await adminClient.from("profiles").select("*");

      // Get item counts manually
      const { data: allItems } = await adminClient
        .from("media_items")
        .select("user_id, id");

      const countMap: Record<string, number> = {};
      if (allItems) {
        for (const item of allItems) {
          countMap[item.user_id] = (countMap[item.user_id] || 0) + 1;
        }
      }

      // Get roles
      const { data: roles } = await adminClient.from("user_roles").select("*");

      const enrichedUsers = users.map((u: any) => {
        const profile = profiles?.find((p: any) => p.user_id === u.id);
        const userRoles = roles?.filter((r: any) => r.user_id === u.id).map((r: any) => r.role) || [];
        return {
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          display_name: profile?.display_name || null,
          avatar_url: profile?.avatar_url || null,
          item_count: countMap[u.id] || 0,
          roles: userRoles,
        };
      });

      return new Response(JSON.stringify({ users: enrichedUsers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete-user") {
      if (!targetUserId) throw new Error("targetUserId required");

      const adminError = await requireAdmin();
      if (adminError) return adminError;

      if (targetUserId === userId) throw new Error("Cannot delete your own account");

      // Delete media items (cascade will handle via user deletion)
      await adminClient.from("media_items").delete().eq("user_id", targetUserId);
      await adminClient.from("profiles").delete().eq("user_id", targetUserId);
      await adminClient.from("user_roles").delete().eq("user_id", targetUserId);

      // Delete user from auth
      const { error } = await adminClient.auth.admin.deleteUser(targetUserId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsert-test-user") {
      const adminError = await requireAdmin();
      if (adminError) return adminError;

      const normalizedEmail = String(email || "").trim().toLowerCase();
      const normalizedPassword = String(password || "");
      const normalizedDisplayName = String(displayName || "").trim() || "Codex Test";

      if (!normalizedEmail) {
        throw new Error("email required");
      }

      if (normalizedPassword.length < 8) {
        throw new Error("password must be at least 8 characters");
      }

      const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (listError) throw listError;

      const existingUser = users.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail);

      let authUserId: string;
      let created = false;

      if (existingUser) {
        const { data, error } = await adminClient.auth.admin.updateUserById(existingUser.id, {
          password: normalizedPassword,
          email_confirm: true,
          user_metadata: {
            ...(existingUser.user_metadata || {}),
            display_name: normalizedDisplayName,
            test_account: true,
          },
        });
        if (error) throw error;
        authUserId = data.user.id;
      } else {
        const { data, error } = await adminClient.auth.admin.createUser({
          email: normalizedEmail,
          password: normalizedPassword,
          email_confirm: true,
          user_metadata: {
            display_name: normalizedDisplayName,
            test_account: true,
          },
        });
        if (error) throw error;
        authUserId = data.user.id;
        created = true;
      }

      const { error: profileError } = await adminClient
        .from("profiles")
        .upsert(
          {
            user_id: authUserId,
            display_name: normalizedDisplayName,
          },
          { onConflict: "user_id" },
        );

      if (profileError) throw profileError;

      return new Response(JSON.stringify({
        success: true,
        created,
        email: normalizedEmail,
        userId: authUserId,
      }), {
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
