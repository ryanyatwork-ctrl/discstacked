/**
 * Same-origin image proxy for third-party artwork CDNs.
 *
 * Why: TMDB, Discogs, IGDB, etc. are blocked by mainstream ad blockers
 * (uBlock, Brave Shields, AdGuard) and by strict corporate firewalls.
 * Routing every artwork URL through discstacked.app/img/<host>/<path>
 * keeps the request same-origin so it can never be blocked client-side.
 *
 * Cloudflare's edge cache fronts this for free — the upstream is only
 * ever fetched once per cache region per cache TTL.
 *
 * Path scheme:
 *   /img/tmdb/<size>/<file>           → image.tmdb.org/t/p/<size>/<file>
 *   /img/tmdb-original/<file>         → image.tmdb.org/t/p/original/<file>
 *   /img/discogs/<path...>            → i.discogs.com/<path...>
 *   /img/discogs-img/<path...>        → img.discogs.com/<path...>
 *   /img/coverart/<path...>           → coverartarchive.org/<path...>
 *   /img/igdb/<path...>               → images.igdb.com/<path...>
 *   /img/rawg/<path...>               → media.rawg.io/<path...>
 *   /img/picsum/<path...>             → picsum.photos/<path...>
 *
 * Anything else returns 400. The whitelist is intentional — without it
 * this becomes an open proxy that anyone could use to launder requests
 * through discstacked.app.
 */

interface UpstreamMapping {
  origin: string;
  /** Optional path prefix to prepend after the host. */
  pathPrefix?: string;
}

const UPSTREAMS: Record<string, UpstreamMapping> = {
  tmdb: { origin: "https://image.tmdb.org", pathPrefix: "/t/p" },
  "tmdb-original": { origin: "https://image.tmdb.org", pathPrefix: "/t/p/original" },
  discogs: { origin: "https://i.discogs.com" },
  "discogs-img": { origin: "https://img.discogs.com" },
  coverart: { origin: "https://coverartarchive.org" },
  igdb: { origin: "https://images.igdb.com" },
  rawg: { origin: "https://media.rawg.io" },
  picsum: { origin: "https://picsum.photos" },
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function buildUpstreamUrl(segments: string[]): URL | null {
  if (segments.length < 2) return null;
  const [key, ...rest] = segments;
  const mapping = UPSTREAMS[key];
  if (!mapping) return null;

  const suffix = rest.map((seg) => encodeURIComponent(seg)).join("/");
  const prefix = mapping.pathPrefix ? mapping.pathPrefix.replace(/\/$/, "") : "";
  return new URL(`${mapping.origin}${prefix}/${suffix}`);
}

function notFound(reason: string): Response {
  return new Response(reason, {
    status: 400,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
}

export const onRequestGet: PagesFunction = async ({ request, params }) => {
  // params.path is the [[path]] catch-all — string when single segment, string[] otherwise.
  const raw = params.path;
  const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const upstream = buildUpstreamUrl(segments);
  if (!upstream) return notFound("Unknown upstream");

  // Edge cache lookup keyed on the same-origin URL.
  const cacheUrl = new URL(request.url);
  cacheUrl.search = ""; // strip cache-busters
  const cacheKey = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = (caches as unknown as { default: Cache }).default;

  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("X-Proxy-Cache", "HIT");
    return hit;
  }

  // Cache miss — fetch from upstream. Tell Cloudflare to cache aggressively
  // at the colo even before we put it in the named cache below.
  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(upstream.toString(), {
      cf: {
        cacheEverything: true,
        cacheTtl: ONE_YEAR_SECONDS,
      },
      // Don't pass through cookies/auth — we want public, identical-for-everyone responses.
      headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8" },
      redirect: "follow",
    });
  } catch (err) {
    return new Response(`Upstream fetch failed: ${(err as Error).message}`, {
      status: 502,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }

  // Don't poison the cache with errors.
  if (!upstreamResponse.ok) {
    return new Response(`Upstream returned ${upstreamResponse.status}`, {
      status: upstreamResponse.status,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }

  // Build a same-origin response with our own cache headers. Strip any
  // upstream cookies, set-cookie, or vary headers that would break caching.
  const body = await upstreamResponse.arrayBuffer();
  const contentType = upstreamResponse.headers.get("Content-Type") ?? "image/jpeg";

  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${ONE_YEAR_SECONDS}, immutable`,
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Proxy-Cache": "MISS",
      "X-Content-Type-Options": "nosniff",
    },
  });

  // Store in named cache for subsequent requests in this colo.
  // ctx.waitUntil isn't available on PagesFunction destructure, so we cache
  // synchronously — the cost is one extra await but the response is small.
  await cache.put(cacheKey, response.clone());
  return response;
};

// HEAD shares the GET handler so that <link rel="preload" as="image"> still works.
export const onRequestHead = onRequestGet;

// Any other method is rejected — never accept writes through this proxy.
export const onRequest: PagesFunction = async () =>
  new Response("Method not allowed", {
    status: 405,
    headers: { Allow: "GET, HEAD" },
  });
