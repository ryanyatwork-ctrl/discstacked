import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchWithRetry(url: string, maxRetries = 6): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url);
    if (res.status === 202) {
      const wait = (i + 1) * 5000;
      console.log(`VGG returned 202, retrying in ${wait}ms… (attempt ${i + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  throw new Error("VGG collection request still queued after retries. Try again in a moment.");
}

interface CollectionItem {
  title: string;
  vggThingId: number;
  yearPublished: number | null;
  imageUrl: string | null;
  platforms: string[];
  rating: number | null;
  numOwned: number | null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function parseCollection(xml: string): CollectionItem[] {
  const items: CollectionItem[] = [];
  const itemRegex = /<item\s[^>]*objectid="(\d+)"[\s\S]*?<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[0];
    const vggThingId = parseInt(match[1], 10);

    const nameMatch = block.match(/<name[^>]*>([^<]*)<\/name>/);
    const title = nameMatch ? decodeEntities(nameMatch[1].trim()) : `VGG #${vggThingId}`;

    const yearMatch = block.match(/<yearpublished>(\d+)<\/yearpublished>/);
    const yearPublished = yearMatch ? parseInt(yearMatch[1], 10) || null : null;

    const imageMatch = block.match(/<image>([^<]*)<\/image>/);
    const thumbnailMatch = block.match(/<thumbnail>([^<]*)<\/thumbnail>/);

    // Extract rating if user rated it
    const ratingMatch = block.match(/<rating\s+value="([^"]*)"/);
    const rating = ratingMatch && ratingMatch[1] !== "N/A" ? parseFloat(ratingMatch[1]) || null : null;

    const ownedMatch = block.match(/<numowned>(\d+)<\/numowned>/);

    // Extract platform names from subtype items
    const platformMatches = [...block.matchAll(/<link\s+type="videogameplatform"[^>]*value="([^"]*)"/g)];
    const platforms = platformMatches.map((m) => decodeEntities(m[1]));

    items.push({
      title,
      vggThingId,
      yearPublished,
      imageUrl: thumbnailMatch ? thumbnailMatch[1].trim() : imageMatch ? imageMatch[1].trim() : null,
      platforms,
      rating,
      numOwned: ownedMatch ? parseInt(ownedMatch[1], 10) || null : null,
    });
  }

  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { username } = await req.json();
    if (!username || typeof username !== "string") {
      return new Response(JSON.stringify({ success: false, error: "VGG username is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // VGG uses the same xmlapi2 as BGG, just on videogamegeek.com
    const url = `https://videogamegeek.com/xmlapi2/collection?username=${encodeURIComponent(username.trim())}&own=1&stats=1&subtype=videogame`;
    console.log(`Fetching VGG collection for "${username}"`);

    const res = await fetchWithRetry(url);

    if (res.status === 404 || res.status === 400) {
      return new Response(JSON.stringify({ success: false, error: `VGG user "${username}" not found.` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!res.ok) {
      console.error(`VGG collection API ${res.status}: ${await res.text()}`);
      return new Response(JSON.stringify({ success: false, error: "VGG API error — please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const xml = await res.text();

    const errorMatch = xml.match(/<error[^>]*>[\s\S]*?<message>([^<]*)<\/message>/);
    if (errorMatch) {
      return new Response(JSON.stringify({ success: false, error: errorMatch[1] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const items = parseCollection(xml);
    console.log(`Parsed ${items.length} items from VGG collection`);

    return new Response(JSON.stringify({ success: true, items, totalItems: items.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in vgg-collection:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
