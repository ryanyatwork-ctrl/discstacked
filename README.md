# DiscStacked

DiscStacked is a Vite + React + TypeScript PWA for cataloging physical media collections. The app is a static frontend hosted on Cloudflare Pages and backed by Supabase for auth, storage, database access, and metadata lookup via Supabase Edge Functions.

## Stack

- Frontend: Vite, React, TypeScript, Tailwind
- Backend services: Supabase Postgres + Supabase Edge Functions
- Metadata sources: TMDB, Discogs, Open Library, VideoGameGeek
- Hosting target: Cloudflare Pages

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create a local env file from the example and fill in the public Supabase values:

```bash
cp .env.example .env.local
```

3. Start the app:

```bash
npm run dev
```

## Environment Variables

Preferred build-time variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Legacy fallback still supported:

- `VITE_SUPABASE_ANON_KEY`

The app also includes a checked-in fallback for the public Supabase URL and publishable key so a static Pages deployment does not blank-screen if Pages build vars are temporarily missing. Cloudflare Pages variables are still the preferred source of truth.

Canonical project note:

- Active Supabase project ref: `uehokbnqudoabjfzcfaj`
- The older `eesngfxqbaalpfxcaxqc` ref came from the Lovable-era backend and should now be treated as deprecated during cutover cleanup.

## Cloudflare Pages Deployment

This repo is configured for a static Cloudflare Pages project named `discstacked`.

- Build command: `npm run build:cloudflare`
- Build output directory: `dist`
- Node version: `22` via [.node-version](/D:/Projects/DiscStacked/.node-version)
- Pages config: [wrangler.toml](/D:/Projects/DiscStacked/wrangler.toml)
- SPA routing: [public/_redirects](/D:/Projects/DiscStacked/public/_redirects)
- Security headers: [public/_headers](/D:/Projects/DiscStacked/public/_headers)

### GitHub Actions behavior

The repo includes [cloudflare-pages.yml](/D:/Projects/DiscStacked/.github/workflows/cloudflare-pages.yml), which:

- runs `npm test` on pushes, pull requests, and manual runs
- builds the app before deployment
- ensures the `discstacked` Pages project exists
- deploys `main` as production
- deploys every non-`main` branch push as a preview deployment

Cloudflare Pages preview aliases are stable per branch and follow the documented branch-alias format: the branch name is lowercased, non-alphanumeric characters become hyphens, and the result is served at `https://<branch-alias>.discstacked.pages.dev`.

Required GitHub repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The API token needs `Account -> Cloudflare Pages -> Edit` permissions.

## Operations Notes

- Production custom domains: `discstacked.app` and `www.discstacked.app`
- Share links and auth redirects use `window.location.origin`, so they follow the active host automatically.
- Google Analytics only initializes on the two production custom domains. Preview deployments stay quieter and do not send production GA pageviews.

Decommission runbooks:

- [Cloudflare post-cutover notes](/D:/Projects/DiscStacked/docs/cloudflare-pages-migration.md)
- [Vercel decommission checklist](/D:/Projects/DiscStacked/docs/decommission-vercel.md)
- [Lovable decommission checklist](/D:/Projects/DiscStacked/docs/decommission-lovable.md)

## Validation

Useful checks before deploy:

```bash
npm test
npm run build
node_modules/.bin/tsc --noEmit
node supabase/functions/tmdb-lookup/detection.test.mjs
```
