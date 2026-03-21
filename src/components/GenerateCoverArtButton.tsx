import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface GenerateCoverArtButtonProps {
  title: string;
  artist?: string;
  genre?: string;
  onGenerated: (coverUrl: string) => void;
  size?: "sm" | "default" | "icon";
  variant?: "outline" | "ghost" | "default";
}

export function GenerateCoverArtButton({
  title,
  artist,
  genre,
  onGenerated,
  size = "sm",
  variant = "outline",
}: GenerateCoverArtButtonProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-cover-art", {
        body: { title, artist, genre },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.cover_url) throw new Error("No image returned");

      onGenerated(data.cover_url);
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
