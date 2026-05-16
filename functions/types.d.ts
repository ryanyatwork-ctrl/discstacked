// Minimal ambient types for Cloudflare Pages Functions.
// Wrangler injects the real types at deploy time; this stub just keeps
// editors/tsc happy when poking at functions/* outside that build context.

export {};

declare global {
  interface PagesFunction<
    Env = unknown,
    P extends string = string,
    Data extends Record<string, unknown> = Record<string, unknown>,
  > {
    (context: EventContext<Env, P, Data>): Response | Promise<Response>;
  }

  interface EventContext<Env, P extends string, Data extends Record<string, unknown>> {
    request: Request;
    env: Env;
    params: Record<P, string | string[]>;
    data: Data;
    next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
    waitUntil: (promise: Promise<unknown>) => void;
    passThroughOnException: () => void;
  }

  // Cloudflare extends RequestInit with cf-specific fields.
  interface RequestInitCfProperties {
    cacheEverything?: boolean;
    cacheTtl?: number;
    cacheTtlByStatus?: Record<string, number>;
  }

  interface RequestInit {
    cf?: RequestInitCfProperties;
  }
}
