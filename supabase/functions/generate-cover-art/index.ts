import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artist, title, genre, mediaType } = await req.json();
    if (!title) throw new Error("Title is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const isGame = mediaType === "games";
    const isMusic = !isGame;

    let prompt: string;

    if (isMusic) {
      const displayText = artist ? `${artist} - ${title}` : title;
      const genreHint = genre ? ` The genre is ${genre}.` : "";
      prompt = `Create a professional, high-quality music album cover art for "${displayText}".${genreHint} The design should be visually striking and artistic. Use bold, creative graphic design with rich colors, dramatic lighting, and professional composition. The artist name "${artist || title}" and album title "${title}" should be incorporated as stylish typography that fits the aesthetic. Make it look like a real commercially released album cover with high production value. Style it as a square album cover. Use vivid colors and sharp details. On a solid background.`;
    } else {
      const displayText = title;
      prompt = `Create a professional video game box art cover for "${displayText}". The design should be dramatic and eye-catching like a real AAA game cover, with dynamic composition, rich colors, and high detail. Include the game title "${title}" as bold, stylized typography. Make it look like authentic retail game packaging art. Use vivid colors and sharp details. On a solid background.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [{ role: "user", content: prompt }],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageUrl) {
      throw new Error("No image generated");
    }

    // Return base64 directly — client will handle storage upload
    return new Response(JSON.stringify({ image_base64: imageUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-cover-art error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
