const FALLBACK_SUPABASE_URL = "https://eesngfxqbaalpfxcaxqc.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVlc25nZnhxYmFhbHBmeGNheHFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3OTU2OTAsImV4cCI6MjA4OTM3MTY5MH0.9Rp8rWBZoLU75ijD3MTEuS_cILqbJkjHihHHVRFUZEo";

type PublicEnvInput = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

function normalize(value?: string) {
  return value?.trim() || undefined;
}

export function resolvePublicEnv(env: PublicEnvInput) {
  const supabaseUrl = normalize(env.VITE_SUPABASE_URL) || FALLBACK_SUPABASE_URL;
  const supabasePublishableKey =
    normalize(env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    normalize(env.VITE_SUPABASE_ANON_KEY) ||
    FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  return {
    supabaseUrl,
    supabasePublishableKey,
  };
}

export const publicEnv = resolvePublicEnv(import.meta.env);
