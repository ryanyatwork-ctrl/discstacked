# DiscStacked

DiscStacked is a Vite + React + TypeScript PWA for cataloging physical media collections. The app is a static frontend that talks to Supabase for auth, storage, database access, and metadata lookup via Supabase Edge Functions.

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

The frontend only needs public Supabase values at build time:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_ANON_KEY` is supported as a legacy fallback, but `VITE_SUPABASE_PUBLISHABLE_KEY` is the preferred variable

Supabase Edge Functions keep their own server-side secrets in Supabase, not in Cloudflare Pages.

## Cloudflare Pages Deployment

This repo is ready to deploy as a static Cloudflare Pages project.

- Framework preset: `None` or `Vite`
- Build command: `npm run build:cloudflare`
- Build output directory: `dist`
- Node version: `22` via [.node-version](/D:/Projects/DiscStacked/.node-version)
- Optional repo config: [wrangler.toml](/D:/Projects/DiscStacked/wrangler.toml)

### GitHub Actions deployment

The repo now includes [cloudflare-pages.yml](/D:/Projects/DiscStacked/.github/workflows/cloudflare-pages.yml), which:

- installs dependencies
- runs `npm test` on pushes and pull requests
- builds the app
- creates the `discstacked` Pages project if it does not already exist
- deploys `dist` to Cloudflare Pages on branch pushes and manual runs

Required GitHub repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The API token needs `Account -> Cloudflare Pages -> Edit` permissions.

### Why the migration is straightforward

- There are no Vercel Functions or Vercel Edge Functions in this repo to port.
- The server-side logic already lives in `supabase/functions/*`.
- SPA routing is already handled by [public/_redirects](/D:/Projects/DiscStacked/public/_redirects), which Cloudflare Pages supports for static assets.

## DNS Switch Notes

Code changes required for the Vercel -> Cloudflare DNS switch:

- None for runtime routing. The app uses `window.location.origin` for auth redirects and share links, so it follows the active host automatically.

Operational changes still required outside the repo:

- Add `discstacked.app` and `www.discstacked.app` as custom domains in Cloudflare Pages.
- Move the domain to Cloudflare DNS or point the required DNS records at the Pages project.
- Update Supabase Auth settings so the Site URL and allowed redirect URLs include the Cloudflare-hosted production and preview domains.
- If the canonical production domain changes, update the hardcoded Open Graph URLs in [index.html](/D:/Projects/DiscStacked/index.html).

### First unattended run checklist

Once the two GitHub secrets exist, the workflow can deploy unattended. The only one-time dashboard work left is:

1. Make sure the Cloudflare account can own the `discstacked` Pages project.
2. Add the custom domains in Pages.
3. Update Supabase Auth redirect settings to include the Pages production and preview URLs.

## Cost Guardrails

- The frontend deploys as static assets, so normal page requests do not invoke paid compute.
- Supabase Edge Functions continue to run only when the app explicitly calls them.
- No Vercel-proprietary services are required for the frontend deployment path.

## Validation

Useful checks before deploy:

```bash
npm test
npm run build
node_modules/.bin/tsc --noEmit
node supabase/functions/tmdb-lookup/detection.test.mjs
```
