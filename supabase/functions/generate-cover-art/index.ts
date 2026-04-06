import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artist, title, genre, mediaType } = await req.json();
    if (!title) throw new Error("Title is required");

    const isGame = mediaType === "games";

    let prompt: string;

    if (!isGame) {
      const displayText = artist ? `${artist} - ${title}` : title;
      const genreHint = genre ? ` The genre is ${genre}.` : "";
      prompt = `Professional high-quality music album cover art for "${displayText}".${genreHint} Visually striking artistic graphic design with rich colors, dramatic lighting, professional composition. Artist name "${artist || title}" and album title "${title}" as stylish typography. Square album cover, vivid colors, sharp details.`;
    } else {
      prompt = `Professional video game box art cover for "${title}". Dramatic eye-catching AAA game cover with dynamic composition, rich colors, high detail. Game title "${title}" as bold stylized typography. Authentic retail game packaging art, vivid colors, sharp details.`;
    }

    const encodedPrompt = encodeURIComponent(prompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 100000)}`;

    // Fetch the image from Pollinations
    const imageResponse = await fetch(pollinationsUrl);
    if (!imageResponse.ok) {
      throw new Error(`Pollinations error: ${imageResponse.status}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    return new Response(JSON.stringify({ image_base64: dataUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("generate-cover-art error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
