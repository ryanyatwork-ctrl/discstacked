import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase server credentials");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const items = Array.isArray(body.items)
      ? body.items
      : [body];

    if (!items || items.length === 0) {
      throw new Error("No items provided for upload");
    }

    const results = [];

    for (const item of items) {
      const { filename, base64, itemId } = item;
      if (!filename || !base64) continue;

      try {
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const filePath = `music/${filename}`;
        const contentType = filename.endsWith(".png") ? "image/png" : "image/jpeg";

        const { error: uploadError } = await supabase.storage
          .from("cover-art")
          .upload(filePath, bytes, {
            contentType,
            upsert: true,
          });

        if (uploadError) {
          console.error(`Upload error for ${filename}:`, uploadError);
          results.push({ filename, success: false, error: uploadError.message });
          continue;
        }

        const { data: publicUrlData } = supabase.storage
          .from("cover-art")
          .getPublicUrl(filePath);

        const publicUrl = publicUrlData.publicUrl;

        if (itemId) {
          await supabase
            .schema("discstacked")
            .from("media_items")
            .update({
              poster_url: publicUrl,
            })
            .eq("id", itemId);
        }

        results.push({ filename, success: true, publicUrl, itemId });
      } catch (err: any) {
        console.error(`Failed processing ${filename}:`, err);
        results.push({ filename, success: false, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: unknown) {
    console.error("upload-cover-art error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
