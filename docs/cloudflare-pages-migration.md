# Cloudflare Pages Operations Notes

## Current deployment shape

- Pages project: `discstacked`
- Production branch: `main`
- Production custom domains:
  - `https://discstacked.app`
  - `https://www.discstacked.app`
- Preview deployment behavior:
  - every non-`main` branch push deploys as a Cloudflare Pages preview
  - preview branch aliases are lowercased and non-alphanumeric characters are replaced with hyphens

## Production-safe assumptions in the repo

- The app deploys as static assets from `dist`.
- SPA routing is handled by [`public/_redirects`](/D:/Projects/DiscStacked/public/_redirects:1).
- Security headers are handled by [`public/_headers`](/D:/Projects/DiscStacked/public/_headers:1).
- The frontend prefers Cloudflare build vars for Supabase config, but it now has a checked-in public fallback so missing Pages build vars do not blank the app.
- Server-side secrets remain in Supabase Edge Functions, not in Cloudflare Pages.

## Post-cutover checks

Run these after each meaningful deployment-related change:

1. Push to a feature branch and confirm a preview deploy appears at the expected `*.pages.dev` branch alias.
2. Merge or push to `main` and confirm production updates on the custom domains.
3. Load `/`, `/auth`, and a representative client-side route directly to confirm SPA routing still resolves to the app shell.
4. Confirm Supabase auth redirects still return to the same host that initiated the flow.
5. Confirm response headers on production include CSP, HSTS, permissions policy, referrer policy, and frame protections.

## Remaining out-of-repo dependencies

- Cloudflare account-level Pages settings and custom-domain attachment
- Cloudflare DNS records for `discstacked.app` and `www.discstacked.app`
- Supabase Auth Site URL and redirect URLs
- Any Cloudflare analytics or challenge features that inject additional scripts into production responses

## Supabase cutover note

- Canonical Supabase project ref: `uehokbnqudoabjfzcfaj`
- Deprecated Lovable-era project ref: `eesngfxqbaalpfxcaxqc`
- Until the cutover is fully validated, treat any auth email, magic link, or dashboard action against `eesngfxqbaalpfxcaxqc` as non-production and avoid mixing the two backends.
