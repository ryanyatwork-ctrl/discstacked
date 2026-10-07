// Supabase OAuth redirects, magic links and password-reset links put the session
// tokens in the URL (#access_token=..., ?code=...). PostHog records the page URL on
// every event and in session replay, so scrub it before anything leaves the browser.
const SENSITIVE = /(?:^|[#?&])(access_token|refresh_token|provider_token|provider_refresh_token|id_token|code)=/;

export function scrubUrl(value: unknown): unknown {
  if (typeof value !== "string" || !SENSITIVE.test(value)) return value;
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/token/i.test(key) || key === "code") url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value.split("#")[0].split("?")[0];
  }
}

function scrubBag(bag: Record<string, unknown> | undefined) {
  if (!bag || typeof bag !== "object") return;
  for (const key of Object.keys(bag)) {
    if (/url|referrer/i.test(key)) bag[key] = scrubUrl(bag[key]);
  }
}

function scrubSnapshot(data: unknown) {
  const list: any[] = Array.isArray(data) ? data : data ? [data] : [];
  for (const item of list) {
    // rrweb meta events (type 4) carry the page href.
    if (item && item.type === 4 && item.data && typeof item.data.href === "string") {
      item.data.href = scrubUrl(item.data.href);
    }
  }
}

export function scrubPostHogEvent<T>(event: T): T {
  const e: any = event;
  if (!e) return event;
  scrubBag(e.properties);
  scrubBag(e.$set);
  scrubBag(e.$set_once);
  if (e.properties && e.properties.$snapshot_data) scrubSnapshot(e.properties.$snapshot_data);
  return event;
}
