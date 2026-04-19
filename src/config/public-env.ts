const FALLBACK_SUPABASE_URL = "https://uehokbnqudoabjfzcfaj.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_KA_3Ih_2CilLB1HzW0-c4g_8F7jKL-1";

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
