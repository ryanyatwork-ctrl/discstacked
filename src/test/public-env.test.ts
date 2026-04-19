import { describe, expect, it } from "vitest";

import { resolvePublicEnv } from "@/config/public-env";

describe("resolvePublicEnv", () => {
  it("prefers explicit publishable key values from the build environment", () => {
    expect(
      resolvePublicEnv({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
        VITE_SUPABASE_ANON_KEY: "legacy-key",
      }),
    ).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "publishable-key",
    });
  });

  it("falls back to the legacy anon key when needed", () => {
    expect(
      resolvePublicEnv({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "legacy-key",
      }),
    ).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabasePublishableKey: "legacy-key",
    });
  });

  it("uses the checked-in public fallback when Cloudflare build vars are absent", () => {
    const resolved = resolvePublicEnv({});

    expect(resolved.supabaseUrl).toBe("https://eesngfxqbaalpfxcaxqc.supabase.co");
    expect(resolved.supabasePublishableKey).toMatch(/^eyJ/);
  });
});
