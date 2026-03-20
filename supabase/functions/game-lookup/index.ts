import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// IGDB token cache
let igdbToken: { token: string; expires: number } | null = null;

async function getIgdbToken(): Promise<string | null> {
  const clientId = Deno.env.get("TWITCH_CLIENT_ID");
  const clientSecret = Deno.env.get("TWITCH_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  if (igdbToken && Date.now() < igdbToken.expires) return igdbToken.token;

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" }
  );
  if (!res.ok) return null;
  const data = await res.json();
  igdbToken = { token: data.access_token, expires: Date.now() + (data.expires_in - 60) * 1000 };
  return igdbToken.token;
}

// IGDB search
async function igdbSearch(query: string) {
  const clientId = Deno.env.get("TWITCH_CLIENT_ID");
  const token = await getIgdbToken();
  if (!token || !clientId) return null;

  const body = `search "${query.replace(/"/g, '\\"')}"; fields name,first_release_date,cover.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,summary,rating; limit 8;`;

  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });
  if (!res.ok) return null;
  const data = await res.json();

  return data.map((g: any) => {
    const year = g.first_release_date
      ? new Date(g.first_release_date * 1000).getFullYear()
      : null;
    const developer = g.involved_companies?.find((c: any) => c.developer)?.company?.name || null;
    const publisher = g.involved_companies?.find((c: any) => c.publisher)?.company?.name || null;

    return {
      id: String(g.id),
      title: g.name,
      year,
      cover_url: g.cover?.image_id
        ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg`
        : null,
      genre: g.genres?.map((ge: any) => ge.name).join(", ") || null,
      platforms: g.platforms?.map((p: any) => p.name) || [],
      developer,
      publisher,
      description: g.summary || null,
      rating: g.rating ? Math.round(g.rating) / 10 : null,
      source: "igdb",
    };
  });
}

// RAWG search
async function rawgSearch(query: string) {
  const key = Deno.env.get("RAWG_API_KEY");
  if (!key) return null;

  const params = new URLSearchParams({
    key,
    search: query,
    page_size: "8",
  });

  const res = await fetch(`https://api.rawg.io/api/games?${params}`);
  if (!res.ok) return null;
  const data = await res.json();

  return (data.results || []).map((g: any) => ({
    id: String(g.id),
    title: g.name,
    year: g.released ? parseInt(g.released) : null,
    cover_url: g.background_image || null,
    genre: g.genres?.map((ge: any) => ge.name).join(", ") || null,
    platforms: g.platforms?.map((p: any) => p.platform.name) || [],
    developer: null,
    publisher: null,
    description: null,
    rating: g.metacritic ? g.metacritic / 10 : null,
    source: "rawg",
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try IGDB first (richer data), fallback to RAWG
    let results = await igdbSearch(query);
    if (!results || results.length === 0) {
      results = await rawgSearch(query);
    }

    return new Response(JSON.stringify({ results: results || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
