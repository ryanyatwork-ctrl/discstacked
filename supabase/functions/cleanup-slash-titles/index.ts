import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TMDB_API_KEY = Deno.env.get("TMDB_API_KEY");

async function searchTmdb(title: string, mediaType: string): Promise<any | null> {
  const tmdbType = mediaType === "movies" ? "movie" : mediaType === "music-films" ? "movie" : null;
  if (!tmdbType) return null;

  const url = `https://api.themoviedb.org/3/search/${tmdbType}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=en-US&page=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[0] || null;
}

async function getTmdbDetails(tmdbId: number): Promise<any> {
  const [detailRes, creditsRes] = await Promise.all([
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`),
    fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${TMDB_API_KEY}&language=en-US`),
  ]);
  const detail = await detailRes.json();
  const credits = creditsRes.ok ? await creditsRes.json() : {};

  const cast = (credits.cast || []).slice(0, 10).map((c: any) => ({
    name: c.name,
    character: c.character,
    profile_url: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
  }));
  const director = (credits.crew || []).filter((c: any) => c.job === "Director").map((c: any) => c.name);
  const writer = (credits.crew || []).filter((c: any) => c.job === "Writer" || c.job === "Screenplay").map((c: any) => c.name);
  const producer = (credits.crew || []).filter((c: any) => c.job === "Producer").map((c: any) => c.name);

  return {
    tmdb_id: detail.id,
    title: detail.title,
    year: detail.release_date ? parseInt(detail.release_date.substring(0, 4)) : null,
    poster_url: detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : null,
    genre: detail.genres?.map((g: any) => g.name).join(", ") || null,
    overview: detail.overview || null,
    runtime: detail.runtime || null,
    cast,
    crew: { director, writer, producer },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify the user is admin
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const { data: roleCheck } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { action, dry_run = true, user_id } = body;

    if (action === "slash-titles") {
      return await handleSlashTitles(adminClient, dry_run, user_id);
    } else if (action === "ghost-products") {
      return await handleGhostProducts(adminClient, dry_run, user_id);
    } else {
      return new Response(JSON.stringify({ error: "Invalid action. Use 'slash-titles' or 'ghost-products'" }), {
        status: 400, headers: corsHeaders,
      });
    }
  } catch (err: any) {
    console.error("Cleanup error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});

async function handleSlashTitles(client: any, dryRun: boolean, filterUserId?: string) {
  // Find all slash-title media_items
  let query = client.from("media_items").select("*").like("title", "% / %");
  if (filterUserId) query = query.eq("user_id", filterUserId);
  const { data: slashItems, error } = await query;
  if (error) throw error;

  const log: any[] = [];

  for (const item of slashItems || []) {
    const titles = item.title.split(" / ").map((t: string) => t.trim()).filter(Boolean);
    if (titles.length < 2) continue;

    const entry: any = {
      original_id: item.id,
      original_title: item.title,
      split_titles: titles,
      movies_found: [],
      status: "pending",
    };

    // Look up each title on TMDB
    const movieDetails: any[] = [];
    for (const title of titles) {
      const searchResult = await searchTmdb(title, item.media_type);
      if (searchResult) {
        const details = await getTmdbDetails(searchResult.id);
        movieDetails.push(details);
        entry.movies_found.push({ title: details.title, tmdb_id: details.tmdb_id, year: details.year });
      } else {
        entry.movies_found.push({ title, tmdb_id: null, year: null, warning: "No TMDB match" });
      }
    }

    if (!dryRun && movieDetails.length > 0) {
      // Create a physical_product for this multi-movie set
      const { data: pp, error: ppErr } = await client.from("physical_products").insert({
        user_id: item.user_id,
        product_title: item.title,
        formats: item.formats || (item.format ? [item.format] : []),
        media_type: item.media_type,
        is_multi_title: true,
        disc_count: movieDetails.length,
        barcode: item.barcode || null,
      }).select().single();

      if (ppErr) {
        entry.status = "error";
        entry.error = ppErr.message;
        log.push(entry);
        continue;
      }

      const createdItemIds: string[] = [];

      for (const movie of movieDetails) {
        // Check if this movie already exists for this user
        const { data: existing } = await client.from("media_items")
          .select("id")
          .eq("user_id", item.user_id)
          .eq("external_id", String(movie.tmdb_id))
          .eq("media_type", item.media_type)
          .limit(1);

        let mediaItemId: string;

        if (existing && existing.length > 0) {
          mediaItemId = existing[0].id;
          // Merge formats
          const { data: existingItem } = await client.from("media_items")
            .select("formats").eq("id", mediaItemId).single();
          const existingFormats = existingItem?.formats || [];
          const newFormats = item.formats || (item.format ? [item.format] : []);
          const merged = [...new Set([...existingFormats, ...newFormats])];
          await client.from("media_items").update({ formats: merged }).eq("id", mediaItemId);
        } else {
          // Create new media_item
          const metadata: any = {};
          if (movie.overview) metadata.overview = movie.overview;
          if (movie.runtime) metadata.runtime = movie.runtime;
          if (movie.cast) metadata.cast = movie.cast;
          if (movie.crew) metadata.crew = movie.crew;

          const { data: newItem, error: insertErr } = await client.from("media_items").insert({
            user_id: item.user_id,
            title: movie.title,
            year: movie.year,
            poster_url: movie.poster_url,
            genre: movie.genre,
            media_type: item.media_type,
            external_id: String(movie.tmdb_id),
            formats: item.formats || (item.format ? [item.format] : []),
            format: item.format || null,
            metadata,
          }).select().single();

          if (insertErr) {
            entry.status = "partial_error";
            entry.error = insertErr.message;
            continue;
          }
          mediaItemId = newItem.id;
        }

        createdItemIds.push(mediaItemId);

        // Create media_copy link
        await client.from("media_copies").insert({
          media_item_id: mediaItemId,
          physical_product_id: pp.id,
          format: item.format || (item.formats?.[0]) || null,
        });
      }

      // Delete old media_copies for the slash-title item
      await client.from("media_copies").delete().eq("media_item_id", item.id);
      // Delete old physical_products that only linked to this item
      const { data: oldCopies } = await client.from("media_copies")
        .select("physical_product_id").eq("media_item_id", item.id);
      // (already deleted above, so none should remain)

      // Also delete any auto-migrated physical_product for this slash-title
      const { data: oldProducts } = await client.from("physical_products")
        .select("id").eq("product_title", item.title).eq("user_id", item.user_id).is("barcode", null);
      for (const op of oldProducts || []) {
        await client.from("media_copies").delete().eq("physical_product_id", op.id);
        await client.from("physical_products").delete().eq("id", op.id);
      }

      // Delete the original slash-title media_item
      await client.from("media_items").delete().eq("id", item.id);

      entry.status = "completed";
      entry.physical_product_id = pp.id;
      entry.created_item_ids = createdItemIds;
    }

    log.push(entry);
  }

  return new Response(JSON.stringify({
    action: "slash-titles",
    dry_run: dryRun,
    total_found: slashItems?.length || 0,
    results: log,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function handleGhostProducts(client: any, dryRun: boolean, filterUserId?: string) {
  // Find media_items that have BOTH barcode-less and barcoded physical_products
  // The barcode-less ones are ghosts from auto-migration
  const { data: allCopies, error: copiesErr } = await client.from("media_copies").select("*");
  if (copiesErr) throw copiesErr;

  let ppQuery = client.from("physical_products").select("*");
  if (filterUserId) ppQuery = ppQuery.eq("user_id", filterUserId);
  const { data: allProducts, error: ppErr } = await ppQuery;
  if (ppErr) throw ppErr;

  const ppMap = new Map<string, any>();
  for (const pp of allProducts || []) ppMap.set(pp.id, pp);

  // Group copies by media_item_id
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
        // Only remove if this ghost product is a single-title (not manually created multi-title)
        if (ghost.product.is_multi_title) continue;

        // Check if this product only links to this one media item
        const otherCopies = (allCopies || []).filter(
          (c: any) => c.physical_product_id === ghost.product.id && c.media_item_id !== mediaItemId
        );
        if (otherCopies.length > 0) continue; // Linked to other items, not a ghost

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
      // Check if product has any remaining copies
      const { data: remaining } = await client.from("media_copies")
        .select("id").eq("physical_product_id", ghost.physical_product_id);
      if (!remaining || remaining.length === 0) {
        await client.from("physical_products").delete().eq("id", ghost.physical_product_id);
      }
    }
  }

  return new Response(JSON.stringify({
    action: "ghost-products",
    dry_run: dryRun,
    ghosts_found: ghostsToRemove.length,
    ghosts: ghostsToRemove,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
