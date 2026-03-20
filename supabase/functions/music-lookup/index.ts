import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Discogs search (if key available)
async function discogsSearch(query: string, barcode?: string) {
  const key = Deno.env.get("DISCOGS_API_KEY");
  const secret = Deno.env.get("DISCOGS_API_SECRET");
  if (!key) return null;

  const params = new URLSearchParams({ per_page: "8" });
  if (barcode) {
    params.set("barcode", barcode);
  } else {
    params.set("q", query);
    params.set("type", "release");
  }
  if (secret) {
    params.set("key", key);
    params.set("secret", secret);
  } else {
    params.set("token", key);
  }

  const res = await fetch(`https://api.discogs.com/database/search?${params}`, {
    headers: { "User-Agent": "DiscStacked/1.0" },
  });
  if (!res.ok) return null;
  const data = await res.json();

  // If we have results, fetch details for richer data
  const results = await Promise.all(
    (data.results || []).slice(0, 8).map(async (r: any) => {
      let tracklist: any[] = [];
      let label = r.label?.[0] || null;
      let year = r.year ? parseInt(r.year) : null;
      let genres = r.genre || [];
      let styles = r.style || [];

      // Fetch release details for tracklist
      if (r.id && r.type === "release") {
        try {
          const detailParams = new URLSearchParams();
          if (secret) {
            detailParams.set("key", key);
            detailParams.set("secret", secret);
          } else {
            detailParams.set("token", key);
          }
          const detailRes = await fetch(
            `https://api.discogs.com/releases/${r.id}?${detailParams}`,
            { headers: { "User-Agent": "DiscStacked/1.0" } }
          );
          if (detailRes.ok) {
            const detail = await detailRes.json();
            tracklist = (detail.tracklist || []).map((t: any) => ({
              position: t.position,
              title: t.title,
              duration: t.duration,
            }));
            if (detail.labels?.[0]?.name) label = detail.labels[0].name;
            if (detail.year) year = detail.year;
            if (detail.genres) genres = detail.genres;
            if (detail.styles) styles = detail.styles;
          }
        } catch {}
      }

      // Parse artist from title (Discogs format: "Artist - Title")
      const titleParts = (r.title || "").split(" - ");
      const artist = titleParts.length > 1 ? titleParts[0].trim() : null;
      const albumTitle = titleParts.length > 1 ? titleParts.slice(1).join(" - ").trim() : r.title;

      return {
        id: String(r.id),
        title: albumTitle,
        artist: artist || "Unknown Artist",
        year,
        cover_url: r.cover_image || r.thumb || null,
        genre: [...genres, ...styles].join(", ") || null,
        label,
        format: r.format?.join(", ") || null,
        tracklist,
        barcode: r.barcode?.[0] || null,
        country: r.country || null,
        source: "discogs",
      };
    })
  );

  return results;
}

// MusicBrainz search (always free, no key)
async function musicBrainzSearch(query: string, barcode?: string) {
  const headers = {
    "User-Agent": "DiscStacked/1.0 (https://discstacked.lovable.app)",
    Accept: "application/json",
  };

  if (barcode) {
    const res = await fetch(
      `https://musicbrainz.org/ws/2/release/?query=barcode:${encodeURIComponent(barcode)}&fmt=json&limit=5`,
      { headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.releases || []).map(mapMBRelease);
  }

  const res = await fetch(
    `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=8`,
    { headers }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.releases || []).map(mapMBRelease);
}

function mapMBRelease(r: any) {
  const artist = r["artist-credit"]?.map((a: any) => a.name).join(", ") || "Unknown Artist";
  const year = r.date ? parseInt(r.date) : null;
  const coverId = r["cover-art-archive"]?.front ? r.id : null;

  return {
    id: r.id,
    title: r.title,
    artist,
    year,
    cover_url: coverId
      ? `https://coverartarchive.org/release/${r.id}/front-250`
      : null,
    genre: null,
    label: r["label-info"]?.[0]?.label?.name || null,
    format: r.media?.map((m: any) => m.format).filter(Boolean).join(", ") || null,
    tracklist: r.media?.[0]?.tracks?.map((t: any) => ({
      position: t.position,
      title: t.title,
      duration: t.length ? `${Math.floor(t.length / 60000)}:${String(Math.floor((t.length % 60000) / 1000)).padStart(2, "0")}` : null,
    })) || [],
    barcode: r.barcode || null,
    country: r.country || null,
    source: "musicbrainz",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, barcode } = await req.json();

    // Try Discogs first, fallback to MusicBrainz
    let results = await discogsSearch(query || "", barcode);
    if (!results || results.length === 0) {
      results = await musicBrainzSearch(query || "", barcode);
    }

    // If barcode lookup returned a single result, return it directly
    if (barcode && results && results.length === 1) {
      const r = results[0];
      return new Response(JSON.stringify({
        title: r.title,
        artist: r.artist,
        year: r.year,
        poster_url: r.cover_url,
        genre: r.genre,
        label: r.label,
        tracklist: r.tracklist,
        barcode: r.barcode,
        source: r.source,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
