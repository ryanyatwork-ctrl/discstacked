type PublicEnvInput = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

function normalize(value?: string) {
  return value?.trim() || undefined;
}

export function resolvePublicEnv(env: PublicEnvInput) {
  const supabaseUrl = normalize(env.VITE_SUPABASE_URL);
  const supabasePublishableKey =
    normalize(env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    normalize(env.VITE_SUPABASE_ANON_KEY);

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Missing Supabase public environment variables.");
  }

  return {
    supabaseUrl,
    supabasePublishableKey,
  };
}

export const publicEnv = resolvePublicEnv(import.meta.env);
