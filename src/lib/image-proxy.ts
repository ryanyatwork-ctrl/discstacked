/**
 * Rewrites third-party artwork URLs to route through the same-origin
 * /img/* Cloudflare Pages Function. Same-origin requests can't be
 * blocked by ad-blockers, corporate firewalls, or strict CSP rules.
 *
 * Keep the upstream URL as the source of truth in the database — only
 * rewrite at display time. This way:
 *   - The DB stays clean and portable
 *   - We can change the proxy contract without rewriting the data
 *   - If the proxy is ever down, we can flip a feature flag and fall back
 *
 * DEV NOTE: The /img/* path is served by a Cloudflare Pages Function that
 * doesn't run under plain `vite dev`. When import.meta.env.DEV is true we
 * skip proxying so images load directly from upstream during local dev.
 * Production builds (and `wrangler pages dev`) still proxy normally.
 */

const UPSTREAM_TO_PREFIX: Array<{
  test: (url: URL) => boolean;
  build: (url: URL) => string;
}> = [
  {
    // image.tmdb.org/t/p/<size>/<file> → /img/tmdb/<size>/<file>
    test: (u) => u.hostname === "image.tmdb.org" && u.pathname.startsWith("/t/p/"),
    build: (u) => {
      const rest = u.pathname.replace(/^\/t\/p\//, "");
      return `/img/tmdb/${rest}`;
    },
  },
  {
    // i.discogs.com/<...> → /img/discogs/<...>
    test: (u) => u.hostname === "i.discogs.com",
    build: (u) => `/img/discogs${u.pathname}`,
  },
  {
    // img.discogs.com/<...> → /img/discogs-img/<...>
    test: (u) => u.hostname === "img.discogs.com",
    build: (u) => `/img/discogs-img${u.pathname}`,
  },
  {
    // coverartarchive.org/<...> → /img/coverart/<...>
    test: (u) => u.hostname === "coverartarchive.org",
    build: (u) => `/img/coverart${u.pathname}`,
  },
  {
    // images.igdb.com/<...> → /img/igdb/<...>
    test: (u) => u.hostname === "images.igdb.com",
    build: (u) => `/img/igdb${u.pathname}`,
  },
  {
    // media.rawg.io/<...> → /img/rawg/<...>
    test: (u) => u.hostname === "media.rawg.io",
    build: (u) => `/img/rawg${u.pathname}`,
  },
  {
    // picsum.photos/<...> → /img/picsum/<...>
    test: (u) => u.hostname === "picsum.photos",
    build: (u) => `/img/picsum${u.pathname}`,
  },
];

/**
 * Returns the same-origin proxied form of a third-party artwork URL.
 * Pass-through cases (returned unchanged):
 *   - Empty / null / undefined input
 *   - Already same-origin (starts with /img/ or relative)
 *   - Supabase storage URLs (we already host these ourselves)
 *   - data: / blob: URLs
 *   - Any host we don't have an upstream mapping for (don't break it
 *     by routing through a 400-returning proxy)
 *   - DEV MODE — the proxy is a Pages Function and doesn't run under
 *     plain `vite dev`. Load upstream directly so artwork works locally.
 */
export function toProxiedImageUrl(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Already same-origin or relative — leave alone.
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;

  // Dev escape hatch — `vite dev` doesn't run Pages Functions, so /img/* 404s.
  // Vitest also sets DEV, so key this to Vite's development mode instead.
  if (import.meta.env.MODE === "development") return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    // Not a parseable URL — return as-is so callers don't crash on bad data.
    return trimmed;
  }

  // Supabase storage already lives on infrastructure we control.
  if (url.hostname.endsWith(".supabase.co")) return trimmed;

  for (const mapping of UPSTREAM_TO_PREFIX) {
    if (mapping.test(url)) {
      // Drop query strings — image CDNs we proxy don't use them meaningfully
      // and stripping them dramatically improves cache hit rate.
      return mapping.build(url);
    }
  }

  // Unknown upstream — leave as-is. Better to attempt a direct load than
  // to route to a proxy endpoint that will 400.
  return trimmed;
}

/** True if this URL is one we'd route through the proxy. */
export function isProxiableImageUrl(input?: string | null): boolean {
  if (!input) return false;
  const proxied = toProxiedImageUrl(input);
  return typeof proxied === "string" && proxied.startsWith("/img/");
}
