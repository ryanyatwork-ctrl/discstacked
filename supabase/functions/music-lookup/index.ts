import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type MusicSearchInput = {
  query?: string;
  barcode?: string;
  artist?: string;
  catalogNumber?: string;
};

function sanitizeText(value: string | null | undefined) {
  return String(value || "").trim();
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => sanitizeText(value)).filter(Boolean))];
}

function formatDuration(ms: number | null | undefined) {
  if (!ms || Number.isNaN(ms)) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function detectFormats(value: string | null | undefined) {
  const normalized = sanitizeText(value).toLowerCase();
  const formats: string[] = [];
  if (!normalized) return formats;
  if (normalized.includes("cd")) formats.push("CD");
  if (normalized.includes("vinyl") || normalized.includes("lp") || normalized.includes('12"') || normalized.includes('7"')) formats.push("Vinyl");
  if (normalized.includes("cassette") || normalized.includes("tape")) formats.push("Cassette");
  if (normalized.includes("digital")) formats.push("Digital");
  return [...new Set(formats)];
}

function buildDiscogsParams(input: MusicSearchInput, key: string, secret: string | null) {
  const params = new URLSearchParams({ per_page: "8", type: "release" });
  const barcode = sanitizeText(input.barcode);
  const artist = sanitizeText(input.artist);
  const catalogNumber = sanitizeText(input.catalogNumber);
  const query = sanitizeText(input.query);

  if (barcode) {
    params.set("barcode", barcode);
  } else if (catalogNumber) {
    params.set("catno", catalogNumber);
    if (artist) params.set("artist", artist);
    if (query) params.set("release_title", query);
  } else {
    if (artist) params.set("artist", artist);
    if (query) params.set("release_title", query);
    if (!artist && !query) params.set("q", query);
  }

  if (secret) {
    params.set("key", key);
    params.set("secret", secret);
  } else {
    params.set("token", key);
  }

  return params;
}

async function fetchDiscogsReleaseDetail(id: number, key: string, secret: string | null) {
  const params = new URLSearchParams();
  if (secret) {
    params.set("key", key);
    params.set("secret", secret);
  } else {
    params.set("token", key);
  }

  const res = await fetch(`https://api.discogs.com/releases/${id}?${params}`, {
    headers: { "User-Agent": "DiscStacked/1.0" },
  });
  if (!res.ok) return null;
  return await res.json();
}

async function discogsSearch(input: MusicSearchInput) {
  const key = Deno.env.get("DISCOGS_API_KEY");
  const secret = Deno.env.get("DISCOGS_API_SECRET");
  if (!key) return null;

  const params = buildDiscogsParams(input, key, secret);
  const res = await fetch(`https://api.discogs.com/database/search?${params}`, {
    headers: { "User-Agent": "DiscStacked/1.0" },
  });
  if (!res.ok) return null;
  const data = await res.json();

  const results = await Promise.all(
    (data.results || []).slice(0, 8).map(async (result: any) => {
      let detail: any = null;
      if (result.id && result.type === "release") {
        try {
          detail = await fetchDiscogsReleaseDetail(result.id, key, secret);
        } catch {
          detail = null;
        }
      }

      const titleParts = sanitizeText(result.title).split(" - ");
      const artist = titleParts.length > 1
        ? titleParts[0].trim()
        : sanitizeText(detail?.artists?.map((entry: any) => entry.name).join(", "));
      const albumTitle = titleParts.length > 1 ? titleParts.slice(1).join(" - ").trim() : sanitizeText(result.title);
      const labels = detail?.labels || [];
      const catalogNumber = sanitizeText(labels.find((label: any) => sanitizeText(label.catno))?.catno || result.catno);
      const formatStrings = (detail?.formats || result.format || []).flatMap((format: any) => {
        if (typeof format === "string") return [format];
        return [format.name, ...(format.descriptions || [])].filter(Boolean);
      });
      const detectedFormats = formatStrings.flatMap((value: string) => detectFormats(value));
      const tracklist = (detail?.tracklist || []).map((track: any) => ({
        position: track.position,
        title: track.title,
        duration: track.duration,
      }));
      const discCount = (detail?.formats || [])
        .map((format: any) => parseInt(String(format.qty || "1"), 10))
        .filter((count: number) => !Number.isNaN(count))
        .reduce((sum: number, count: number) => sum + count, 0) || null;
      const country = sanitizeText(detail?.country || result.country);

      return {
        id: String(result.id),
        title: albumTitle,
        artist: artist || "Unknown Artist",
        year: detail?.year ? Number(detail.year) : (result.year ? Number(result.year) : null),
        cover_url: result.cover_image || result.thumb || null,
        genre: uniqueStrings([...(detail?.genres || result.genre || []), ...(detail?.styles || result.style || [])]).join(", ") || null,
        label: sanitizeText(labels[0]?.name || result.label?.[0]) || null,
        catalog_number: catalogNumber || null,
        format: uniqueStrings(formatStrings).join(", ") || null,
        detected_formats: uniqueStrings(detectedFormats),
        disc_count: discCount,
        tracklist,
        barcode: sanitizeText((detail?.identifiers || []).find((identifier: any) => identifier.type === "Barcode")?.value || result.barcode?.[0]) || null,
        country: country || null,
        source: "discogs",
      };
    }),
  );

  return results;
}

function buildMusicBrainzQuery(input: MusicSearchInput) {
  const barcode = sanitizeText(input.barcode);
  const artist = sanitizeText(input.artist);
  const title = sanitizeText(input.query);
  const catalogNumber = sanitizeText(input.catalogNumber);

  if (barcode) return `barcode:${barcode}`;

  const parts: string[] = [];
  if (catalogNumber) parts.push(`catno:${catalogNumber}`);
  if (artist) parts.push(`artist:${artist}`);
  if (title) parts.push(`release:${title}`);

  return parts.length > 0 ? parts.join(" AND ") : title;
}

async function musicBrainzSearch(input: MusicSearchInput) {
  const headers = {
    "User-Agent": "DiscStacked/1.0 (https://discstacked.app)",
    Accept: "application/json",
  };

  const query = buildMusicBrainzQuery(input);
  if (!query) return [];

  const res = await fetch(
    `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json&limit=8`,
    { headers },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.releases || []).map(mapMBRelease);
}

function mapMBRelease(release: any) {
  const artist = release["artist-credit"]?.map((entry: any) => entry.name).join(", ") || "Unknown Artist";
  const catalogNumber = sanitizeText(release["label-info"]?.find((entry: any) => sanitizeText(entry["catalog-number"]))?.["catalog-number"]);
  const media = release.media || [];
  const tracklist = media.flatMap((medium: any) =>
    (medium.tracks || []).map((track: any) => ({
      position: track.position,
      title: track.title,
      duration: formatDuration(track.length),
    })),
  );
  const formatStrings = media.map((medium: any) => sanitizeText(medium.format)).filter(Boolean);

  return {
    id: release.id,
    title: release.title,
    artist,
    year: release.date ? parseInt(release.date, 10) : null,
    cover_url: release["cover-art-archive"]?.front
      ? `https://coverartarchive.org/release/${release.id}/front-250`
      : null,
    genre: null,
    label: sanitizeText(release["label-info"]?.[0]?.label?.name) || null,
    catalog_number: catalogNumber || null,
    format: uniqueStrings(formatStrings).join(", ") || null,
    detected_formats: uniqueStrings(formatStrings.flatMap((value) => detectFormats(value))),
    disc_count: media.length || null,
    tracklist,
    barcode: sanitizeText(release.barcode) || null,
    country: sanitizeText(release.country) || null,
    source: "musicbrainz",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as MusicSearchInput;
    const input: MusicSearchInput = {
      query: sanitizeText(payload.query),
      barcode: sanitizeText(payload.barcode),
      artist: sanitizeText(payload.artist),
      catalogNumber: sanitizeText(payload.catalogNumber),
    };

    let results = await discogsSearch(input);
    if (!results || results.length === 0) {
      results = await musicBrainzSearch(input);
    }

    if (input.barcode && results && results.length === 1) {
      const release = results[0];
      return new Response(JSON.stringify({
        title: release.title,
        artist: release.artist,
        year: release.year,
        poster_url: release.cover_url,
        genre: release.genre,
        label: release.label,
        catalog_number: release.catalog_number,
        country: release.country,
        tracklist: release.tracklist,
        barcode: release.barcode,
        detected_formats: release.detected_formats,
        source: release.source,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ results: results || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
