import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface GenerateCoverArtButtonProps {
  title: string;
  artist?: string;
  genre?: string;
  mediaType?: string;
  onGenerated: (coverUrl: string) => void;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "default";
}

export function GenerateCoverArtButton({
  title,
  artist,
  genre,
  mediaType,
  onGenerated,
  size = "sm",
  variant = "outline",
}: GenerateCoverArtButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // 1. Call edge function to generate image (returns base64)
      const { data, error } = await supabase.functions.invoke("generate-cover-art", {
        body: { title, artist, genre, mediaType },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.image_base64) throw new Error("No image returned");

      // 2. Convert base64 to blob and upload via client (uses user's auth)
      const base64 = data.image_base64.replace(/^data:image\/\w+;base64,/, "");
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "image/png" });
      const fileName = `ai-covers/${crypto.randomUUID()}.png`;

      const { error: uploadError } = await supabase.storage
        .from("cover-art")
        .upload(fileName, blob, { contentType: "image/png", upsert: true });

      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

      // 3. Get public URL
      const { data: urlData } = supabase.storage
        .from("cover-art")
        .getPublicUrl(fileName);

      onGenerated(urlData.publicUrl);
      toast({ title: "Cover art generated!", description: "AI-created artwork has been applied." });
    } catch (err: any) {
      toast({
        title: "Generation failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleGenerate}
      disabled={generating}
      className="gap-2"
    >
      {generating ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {generating ? "Generating…" : "AI Cover Art"}
    </Button>
  );
}
