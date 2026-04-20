import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");

async function fetchTmdbMovieDetails(tmdbId: number) {
  const [detailRes, creditsRes] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`),
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=en-US`),
  ]);
  const detail = await detailRes.json();
  const credits = creditsRes.ok ? await creditsRes.json() : {};
  const cast = (credits.cast || []).slice(0, 10).map((c: any) => ({
    name: c.name, character: c.character,
    profile_url: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
  }));
  const director = (credits.crew || []).filter((c: any) => c.job === "Director").map((c: any) => c.name);
  const writer = (credits.crew || []).filter((c: any) => c.job === "Writer" || c.job === "Screenplay").map((c: any) => c.name);
  const producer = (credits.crew || []).filter((c: any) => c.job === "Producer").map((c: any) => c.name);
  return {
    tmdb_id: detail.id, title: detail.title,
    year: detail.release_date ? parseInt(detail.release_date.substring(0, 4)) : null,
    poster_url: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
    genre: detail.genres?.map((g: any) => g.name).join(", ") || null,
    overview: detail.overview || null, runtime: detail.runtime || null,
    cast, crew: { director, writer, producer },
  };
}

async function searchTmdb(title: string) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US&page=1`;
  const res = await fetch(url);
  const data = await res.json();
  return data.results?.[0] || null;
}

async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await client.auth.getUser();
  return user;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { action } = body;

    if (action === "split-single") {
      return await handleSplitSingle(admin, body.item_id, user.id);
    } else if (action === "merge") {
      return await handleMerge(admin, body.keep_id, body.delete_id, user.id);
    } else if (action === "ghost-products") {
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
      }
      return await handleGhostProducts(admin, body.dry_run !== false, body.user_id);
    } else {
      return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400, headers: corsHeaders });
    }
  } catch (err: any) {
    console.error("Cleanup error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

async function handleSplitSingle(client: any, itemId: string, userId: string) {
  // Get the slash-title item
  const { data: item, error } = await client.from("media_items").select("*").eq("id", itemId).single();
  if (error) throw error;
  if (item.user_id !== userId) throw new Error("Not your item");

  const titles = item.title.split(" / ").map((t: string) => t.trim()).filter(Boolean);
  if (titles.length < 2) throw new Error("Not a slash-title entry");

  const formats = item.formats || (item.format ? [item.format] : []);

  // Create a physical_product for the multi-pack
  const { data: pp, error: ppErr } = await client.from("physical_products").insert({
    user_id: userId,
    product_title: item.title,
    formats,
    media_type: item.media_type,
    is_multi_title: true,
    disc_count: titles.length,
    barcode: item.barcode || null,
  }).select().single();
  if (ppErr) throw ppErr;

  const createdIds: string[] = [];

  for (const title of titles) {
    // TMDB lookup
    const searchResult = await searchTmdb(title);
    let movieData: any = null;
    if (searchResult) {
      movieData = await fetchTmdbMovieDetails(searchResult.id);
    }

    // Check for existing item with same external_id
    let mediaItemId: string | null = null;
    if (movieData?.tmdb_id) {
      const { data: existing } = await client.from("media_items")
        .select("id, formats")
        .eq("user_id", userId)
        .eq("external_id", String(movieData.tmdb_id))
        .eq("media_type", item.media_type)
        .limit(1);

      if (existing && existing.length > 0) {
        mediaItemId = existing[0].id;
        // Merge formats
        const merged = [...new Set([...(existing[0].formats || []), ...formats])];
        await client.from("media_items").update({ formats: merged }).eq("id", mediaItemId);
      }
    }

    if (!mediaItemId) {
      const metadata: any = {};
      if (movieData?.overview) metadata.overview = movieData.overview;
      if (movieData?.runtime) metadata.runtime = movieData.runtime;
      if (movieData?.cast) metadata.cast = movieData.cast;
      if (movieData?.crew) metadata.crew = movieData.crew;

      const { data: newItem, error: insertErr } = await client.from("media_items").insert({
        user_id: userId,
        title: movieData?.title || title,
        year: movieData?.year || null,
        poster_url: movieData?.poster_url || null,
        genre: movieData?.genre || null,
        media_type: item.media_type,
        external_id: movieData?.tmdb_id ? String(movieData.tmdb_id) : null,
        formats,
        format: formats[0] || null,
        metadata,
      }).select().single();
      if (insertErr) throw insertErr;
      mediaItemId = newItem.id;
    }

    createdIds.push(mediaItemId!);

    // Link to physical product
    await client.from("media_copies").insert({
      media_item_id: mediaItemId,
      physical_product_id: pp.id,
      format: formats[0] || null,
    });
  }

  // Delete old copies and physical products linked to the slash item
  const { data: oldCopies } = await client.from("media_copies").select("physical_product_id").eq("media_item_id", itemId);
  await client.from("media_copies").delete().eq("media_item_id", itemId);
  for (const oc of oldCopies || []) {
    const { data: remaining } = await client.from("media_copies").select("id").eq("physical_product_id", oc.physical_product_id);
    if (!remaining || remaining.length === 0) {
      await client.from("physical_products").delete().eq("id", oc.physical_product_id);
    }
  }

  // Delete the original slash-title item
  await client.from("media_items").delete().eq("id", itemId);

  return new Response(JSON.stringify({
    success: true,
    created_count: createdIds.length,
    created_ids: createdIds,
    physical_product_id: pp.id,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleMerge(client: any, keepId: string, deleteId: string, userId: string) {
  // Verify both items belong to user
  const { data: keepItem } = await client.from("media_items").select("*").eq("id", keepId).single();
  const { data: deleteItem } = await client.from("media_items").select("*").eq("id", deleteId).single();
  if (!keepItem || !deleteItem) throw new Error("Items not found");
  if (keepItem.user_id !== userId || deleteItem.user_id !== userId) throw new Error("Not your items");

  // Merge formats
  const mergedFormats = [...new Set([...(keepItem.formats || []), ...(deleteItem.formats || [])])];
  await client.from("media_items").update({ formats: mergedFormats }).eq("id", keepId);

  // Re-link any media_copies from deleteItem to keepItem
  await client.from("media_copies").update({ media_item_id: keepId }).eq("media_item_id", deleteId);

  // Delete orphaned physical products
  const { data: oldCopies } = await client.from("media_copies").select("physical_product_id").eq("media_item_id", deleteId);
  await client.from("media_copies").delete().eq("media_item_id", deleteId);
  for (const oc of oldCopies || []) {
    const { data: remaining } = await client.from("media_copies").select("id").eq("physical_product_id", oc.physical_product_id);
    if (!remaining || remaining.length === 0) {
      await client.from("physical_products").delete().eq("id", oc.physical_product_id);
    }
  }

  // Delete the duplicate item
  await client.from("media_items").delete().eq("id", deleteId);

  return new Response(JSON.stringify({
    success: true, kept_id: keepId, deleted_id: deleteId, merged_formats: mergedFormats,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleGhostProducts(client: any, dryRun: boolean, filterUserId?: string) {
  const { data: allCopies, error: copiesErr } = await client.from("media_copies").select("*");
  if (copiesErr) throw copiesErr;

  let ppQuery = client.from("physical_products").select("*");
  if (filterUserId) ppQuery = ppQuery.eq("user_id", filterUserId);
  const { data: allProducts, error: ppErr } = await ppQuery;
  if (ppErr) throw ppErr;

  const ppMap = new Map<string, any>();
  for (const pp of allProducts || []) ppMap.set(pp.id, pp);

  const itemCopies = new Map<string, any[]>();
  for (const copy of allCopies || []) {
    const pp = ppMap.get(copy.physical_product_id);
    if (!pp) continue;
    if (filterUserId && pp.user_id !== filterUserId) continue;
    if (!itemCopies.has(copy.media_item_id)) itemCopies.set(copy.media_item_id, []);
    itemCopies.get(copy.media_item_id)!.push({ copy, product: pp });
  }

  const ghostsToRemove: any[] = [];
  for (const [mediaItemId, entries] of itemCopies) {
    const hasBarcoded = entries.some(e => e.product.barcode != null);
    const barcodeless = entries.filter(e => e.product.barcode == null);
    if (hasBarcoded && barcodeless.length > 0) {
      for (const ghost of barcodeless) {
        if (ghost.product.is_multi_title) continue;
        const otherCopies = (allCopies || []).filter(
          (c: any) => c.physical_product_id === ghost.product.id && c.media_item_id !== mediaItemId
        );
        if (otherCopies.length > 0) continue;
        ghostsToRemove.push({
          media_item_id: mediaItemId,
          physical_product_id: ghost.product.id,
          product_title: ghost.product.product_title,
          copy_id: ghost.copy.id,
        });
      }
    }
  }

  if (!dryRun) {
    for (const ghost of ghostsToRemove) {
      await client.from("media_copies").delete().eq("id", ghost.copy_id);
      const { data: remaining } = await client.from("media_copies").select("id").eq("physical_product_id", ghost.physical_product_id);
      if (!remaining || remaining.length === 0) {
        await client.from("physical_products").delete().eq("id", ghost.physical_product_id);
      }
    }
  }

  return new Response(JSON.stringify({
    action: "ghost-products", dry_run: dryRun,
    ghosts_found: ghostsToRemove.length, ghosts: ghostsToRemove,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
