# DiscStacked Project Scope for Command Center

Prepared: 2026-06-01

This document captures the current known operating scope for DiscStacked based on the local repository, live public DNS/RDAP/HTTP checks, and project runbooks. It intentionally does not include secret values. Any token, API key, service role key, or password should be represented in the command center by presence, owner, rotation status, and storage location only.

## Executive Summary

DiscStacked is a Vite, React, and TypeScript PWA for cataloging personal physical media collections. The active app is a static frontend hosted on Cloudflare Pages, backed by Supabase for auth, Postgres, storage, and Edge Functions. The canonical deployment path is GitHub to Cloudflare Pages via GitHub Actions. Vercel and Lovable are documented as legacy/decommissioning surfaces, not the intended production path.

The command center should treat the following as first-class operational systems:

- Domain and DNS: `discstacked.app`, `www.discstacked.app`, Cloudflare registrar/DNS.
- Hosting: Cloudflare Pages project `discstacked`.
- Source control and CI/CD: GitHub repo `ryanyatwork-ctrl/discstacked`.
- Backend: Supabase project ref `ykyneinxsgcdjejmlxkg`, plus deprecated refs to reconcile in older docs/config.
- External APIs: TMDB, Discogs, MusicBrainz, Open Library, Google Books, IGDB/Twitch, RAWG, VideoGameGeek, UPCitemdb, Blu-ray.com, Google Analytics.
- Payments: no Stripe integration is present in the repo today.
- Security and compliance: auth redirects, RLS policies, storage buckets, Edge Function secrets, public headers, privacy/terms, local leaked-token hygiene.

## Product Scope

DiscStacked lets users build and browse media collections with collector-level details.

Core collection categories:

- Movies.
- TV.
- Music Media.
- CDs.
- Games.

Legacy note: older docs and copy still mention Books, and a `book-lookup` Supabase function remains in the codebase. Current app tabs do not include Books, and `src/lib/types.ts` notes that Books now live in BookStacked. The command center should track this as a stale-copy/legacy-backend cleanup item.

Core product capabilities:

- Email/password sign-up and sign-in through Supabase Auth.
- Personal collection CRUD for media items.
- Poster/card and list browsing.
- Search, filters, A-Z rail, and collection stats.
- Barcode lookup and bulk scanning.
- Format tracking across physical media formats.
- Exact package/edition tracking through `physical_products`, `media_copies`, and `edition_catalog`.
- Digital copy, Plex, wishlist, want-to-watch, last-watched, and notes fields.
- Randomizer for selecting what to watch.
- Public read-only share links at `/share/:token`.
- Profile display name, avatar, share token, and shared tab selection.
- Settings workflows for imports, metadata refresh, barcode reapply, cover generation, and exports.
- Admin workflows for first-admin setup, user listing, role checks, and user deletion.
- Collection cleanup workflows for duplicate/slash-title remediation.
- PWA install support through manifest, icons, service worker, and runtime artwork caching.

## Site and Routes

Production domains:

- `https://discstacked.app`
- `https://www.discstacked.app`

Observed live response:

- Both production domains return HTTP 200.
- Both are served by Cloudflare.
- HSTS is enabled with `max-age=31536000; includeSubDomains; preload`.
- Live CSP allows Supabase, analytics, metadata providers, and artwork hosts.

Application routes:

- `/` - primary collection app or landing preview.
- `/auth` - sign-in/sign-up.
- `/profile` - user profile and sharing controls.
- `/settings` - settings, import/export, metadata tools.
- `/share/:token` - public shared collection.
- `/terms` - Terms of Service.
- `/privacy` - Privacy Policy.
- `/admin` - admin console.
- `/admin/cleanup` - collection cleanup.
- `*` - not found.

SEO/social/PWA assets:

- Title: `DiscStacked - Catalog Your Physical Media`.
- Canonical social URL in metadata: `https://discstacked.app`.
- OG image: `https://discstacked.app/og-image.jpg`.
- Manifest name and short name: `DiscStacked`.
- Theme/background color: `#0A0A0A`.
- App icons: favicon, 192px, 512px, Apple touch icon.

Support/legal:

- Support email: `support@discstacked.app`.
- Privacy and Terms pages are in-app React pages.
- Privacy page states Google Analytics is used and collection data is private by default unless sharing is enabled.

## Domain, Registrar, and DNS

Domain:

- `discstacked.app`

Public RDAP facts observed 2026-06-01:

- Registrar: CloudFlare, Inc.
- IANA registrar ID: 1910.
- Registration date: 2026-03-18T04:22:34.927Z.
- Expiration date: 2027-03-18T04:22:34.927Z.
- Last changed: 2026-03-23T04:22:34.927Z.
- Status: client transfer prohibited.
- Nameservers: `adam.ns.cloudflare.com`, `gail.ns.cloudflare.com`.
- DNSSEC: registry reports `zoneSigned: true`, `delegationSigned: false`.

Observed DNS:

- Apex A records: `104.21.26.150`, `172.67.136.135`.
- Apex AAAA records: `2606:4700:3032::6815:1a96`, `2606:4700:3030::ac43:8887`.
- `www` resolves to the same Cloudflare A/AAAA edge addresses.
- MX records use Cloudflare Email Routing:
  - `route2.mx.cloudflare.net`, priority 37.
  - `route1.mx.cloudflare.net`, priority 50.
  - `route3.mx.cloudflare.net`, priority 76.
- TXT SPF: `v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all`.

Command-center tracking requirements:

- Registrar account owner.
- Domain renewal date and auto-renew status.
- Nameserver/DNS owner.
- DNSSEC desired state.
- Email routing purpose and destination mailbox owner.
- SPF/DKIM/DMARC completeness. DMARC was not observed in the checked apex TXT output.

## Hosting and Cloudflare

Active hosting target:

- Cloudflare Pages project: `discstacked`.
- Production branch: `main`.
- Build command: `npm run build:cloudflare`.
- Output directory: `dist`.
- Node version: `22`, via `.node-version` and `package.json` engines.
- Pages config: `wrangler.toml`.
- Cloudflare account ID in `wrangler.toml`: `769c38fcd7dd8ae3637cd58eb62bf8e9`.
- Compatibility date: `2026-04-19`.

Routing and headers:

- SPA fallback: `public/_redirects` maps all routes to `/index.html 200`.
- Security headers: `public/_headers`.
- Important headers include CSP, HSTS, Permissions-Policy, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options.

Supabase project note:

- The repo header allows wildcard Supabase hosts and current sources.
- The live production CSP explicitly references Supabase ref `ykyneinxsgcdjejmlxkg`.
- Correct production Supabase URL: `https://ykyneinxsgcdjejmlxkg.supabase.co`.
- Older repo docs/config still mention `uehokbnqudoabjfzcfaj`; treat that as stale until the repo is corrected.

Cloudflare items to include:

- Pages project status and latest production deploy.
- Preview deployment aliases for non-`main` branches.
- Custom domain attachment for apex and `www`.
- DNS records.
- Email routing records.
- Any Cloudflare analytics, bot/challenge, firewall, or injected-script settings.
- `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` secret presence in GitHub Actions.

## GitHub and CI/CD

Repository:

- Remote: `https://github.com/ryanyatwork-ctrl/discstacked.git`.
- Local branch: `main`.
- Local status during this audit: `main` was ahead of `origin/main` by 1 commit and behind by 8 commits, with multiple modified and untracked files.

GitHub Actions workflow:

- Workflow file: `.github/workflows/cloudflare-pages.yml`.
- Name: `Deploy To Cloudflare Pages`.
- Triggers: push, pull request, manual `workflow_dispatch`.
- Manual input: `skip_tests`, default `false`.
- Permissions: `contents: read`, `deployments: write`.

Verify job:

- Runs on Ubuntu latest.
- Checks out repo.
- Uses Node version from `.node-version`.
- Runs `npm ci`.
- Installs Playwright Chromium.
- Runs `npm run test:e2e`.
- Runs `npm test`.
- Runs `npm run build:cloudflare`.

Deploy job:

- Skips pull requests.
- Runs after verify success or manual skip.
- Uses concurrency group `cloudflare-pages-${{ github.ref }}`.
- Ensures Cloudflare Pages project exists.
- Deploys `dist` with `wrangler pages deploy`.
- Uses branch name as Cloudflare Pages branch.

Required GitHub secrets:

- `CLOUDFLARE_API_TOKEN`.
- Docs also mention `CLOUDFLARE_ACCOUNT_ID`, though the current workflow does not consume it directly.

Command-center tracking requirements:

- Default branch protection.
- Required checks.
- Latest CI result.
- Deploy history and currently deployed commit.
- GitHub secret inventory, not values.
- Dependabot or dependency update posture.
- Open PRs/issues if the GitHub API/app is connected later.

## Vercel

Current role:

- Vercel is documented as legacy/decommissioning, not active production hosting.
- Runbook: `docs/decommission-vercel.md`.

Known Vercel project:

- Project name: `discstacked`.
- Old custom domains to remove from Vercel after Cloudflare cutover is proven healthy:
  - `discstacked.app`
  - `www.discstacked.app`

Decommission gates:

- Cloudflare production domains load without runtime errors.
- Fresh `main` deployment has completed on Cloudflare.
- At least one non-`main` branch preview works on Cloudflare.
- Supabase Auth Site URL and redirect URLs include Cloudflare domains and preview pattern.
- No DNS records still point to Vercel.
- No team member needs Vercel preview URLs for rollback/comparison.

Command-center tracking requirements:

- Whether Vercel project still exists.
- Whether custom domains are still attached in Vercel.
- Whether Vercel env vars still exist.
- Whether Vercel Git hooks are disabled.
- Whether Vercel analytics/speed insights are disabled.
- Date Vercel can be safely deleted.

## Lovable

Current role:

- Lovable is documented as legacy/decommissioning.
- Runbook: `docs/decommission-lovable.md`.

Desired done state:

- No tracked source references Lovable.
- No tracked lockfile contains Lovable-specific registry or package entries.
- CI, local dev, and Cloudflare deploys do not depend on Lovable.
- Any remaining Lovable artifacts are intentionally kept as historical local files only.

Command-center tracking requirements:

- Legacy artifacts remaining.
- Workflow/docs references remaining.
- Confirmation that GitHub + Cloudflare Pages + Supabase are the canonical path.

## Supabase

Canonical project:

- Active Supabase project ref: `ykyneinxsgcdjejmlxkg`.
- Active Supabase URL: `https://ykyneinxsgcdjejmlxkg.supabase.co`.
- Deprecated Lovable-era project ref: `eesngfxqbaalpfxcaxqc`.
- Stale project ref still present in some repo docs/config: `uehokbnqudoabjfzcfaj`.

Client configuration:

- Supabase JS package: `@supabase/supabase-js`.
- Client uses schema alias `discstacked` mapped to generated `public` types.
- Auth config persists sessions in `localStorage`, auto-refreshes tokens, and uses Supabase Auth.

Public frontend env vars:

- `VITE_SUPABASE_URL`.
- `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Legacy fallback supported by docs/example: `VITE_SUPABASE_ANON_KEY`.
- Local `.env` also contains `VITE_SUPABASE_PROJECT_ID`.

Important discrepancy:

- README says the app has a checked-in public fallback for Supabase URL/key.
- Current `src/config/public-env.ts` throws if public Supabase env vars are missing.
- Command center should track whether missing Cloudflare Pages env vars can still blank-screen production.

Database tables:

- `media_items`: core collection records by user, media type, title, poster, metadata, formats, watched/wishlist/digital/Plex flags, sort title, barcode, external ID, total copies.
- `profiles`: display name, avatar, share token, shared tabs.
- `user_roles`: admin/moderator/user roles.
- `physical_products`: exact packages/editions owned by a user, including barcode, formats, disc count, purchase info, metadata.
- `media_copies`: links physical products to logical media items/discs.
- `edition_catalog`: reusable barcode/package catalog with product title, formats, disc count, package image, external ID, confidence, and metadata.

Database functions/enums:

- `has_role(_user_id, _role)` returns boolean.
- `app_role`: `admin`, `moderator`, `user`.
- `upsert_physical_media` is called from the app and should be verified in migrations/types if the command center exposes DB functions.

Storage buckets:

- `cover-art`: public bucket for cover art uploads.
- `avatars`: public bucket for profile avatars.

RLS/security model:

- `media_items`, `profiles`, `user_roles`, `physical_products`, `media_copies`, and `edition_catalog` have RLS policies in migrations.
- User-owned data is limited by `auth.uid()`.
- Shared collections are exposed through share-token/profile policies.
- `edition_catalog` is readable by anyone and writable by authenticated users.

Supabase Edge Functions:

- `admin-users`: admin setup, role checks, user listing, delete user.
- `book-lookup`: Google Books/Open Library lookup, retained though Books are not a current app tab.
- `cleanup-slash-titles`: admin cleanup and title/package merging helpers.
- `game-lookup`: IGDB/Twitch search with RAWG fallback.
- `generate-cover-art`: generated cover art helper.
- `music-lookup`: Discogs search with MusicBrainz fallback.
- `tmdb-lookup`: TMDB/movie/TV/barcode lookup with UPCitemdb, Blu-ray.com, Open Library, barcode overrides, multi-movie and TV-season logic.
- `vgg-collection`: VideoGameGeek owned-game import.

Edge Function JWT verification:

- `supabase/config.toml` sets `verify_jwt = false` for all listed functions.
- Some functions do their own auth/admin checks.
- Command center should flag public callable functions and show auth expectations per function.

Supabase secrets and backend env vars:

- Supabase built-ins: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Admin: `ADMIN_SETUP_PASSWORD`.
- Movies/TV: `TMDB_API_KEY`.
- Music: `DISCOGS_API_KEY`, `DISCOGS_API_SECRET`.
- Books: `GOOGLE_BOOKS_API_KEY`.
- Games: `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `RAWG_API_KEY`.
- VGG import: `BGG_API_TOKEN`.
- Local notes reference `TVTRACKER_INGEST_TOKEN`; no corresponding active function was found in the current `supabase/functions` directory.

Security hygiene:

- The file `supabase auth.txt` appears to contain operational secret-setting notes and at least one sensitive token value. This should be removed from the repo/workspace, rotated if it was real, and represented in the command center as a secret inventory item only.
- The untracked file named `$envTVTRACKER_INGEST_TOKEN=your_ing.txt` appears to be a local operational note and should be reviewed.

## Stripe and Payments

Current finding:

- No active Stripe integration was found in source, config, package dependencies, Supabase functions, or env variable usage.
- No checkout, billing, subscription, price, customer, or webhook implementation appears in the repo.

Command-center implication:

- Stripe should be represented as `not integrated` unless there is an external Stripe account or future monetization plan outside this repo.
- If payments are planned, the command center should reserve sections for products/prices, checkout, customer portal, webhooks, Supabase user mapping, tax, receipts, and environment separation.

## External API and Data Providers

Metadata and lookup providers:

- TMDB: movies, TV, posters, credits, seasons, collections, UPC lookup.
- UPCitemdb: barcode title/package lookup.
- Blu-ray.com: barcode/package title/image/disc count scraping for Blu-ray/DVD packages.
- Open Library: ISBN/barcode fallback.
- Google Books: book lookup when configured.
- Discogs: music/CD release search and release detail lookup.
- MusicBrainz: music fallback.
- Cover Art Archive: music cover fallback.
- IGDB: game lookup through Twitch OAuth client credentials.
- RAWG: game fallback.
- VideoGameGeek/BoardGameGeek API token: VGG owned collection import.
- Google Analytics: production-only page analytics with GA ID `G-DPCDHQYYFF`.
- Google Tag Manager script host: used to load gtag.
- Cloudflare Insights host is permitted by CSP.

Artwork proxy:

- `functions/img/[[path]].ts` documents routing third-party artwork through `discstacked.app/img/<host>/<path>` to avoid ad-blocker issues for sources such as TMDB and Discogs.
- The Vite dev server does not run that Pages Function locally; image proxy behavior is production/Cloudflare-specific.

Command-center tracking requirements:

- Provider account owner.
- API key/secret presence and rotation date.
- Rate limit constraints.
- Terms/privacy links.
- Fallback order by media type.
- Provider health and last successful lookup.

## Analytics

Google Analytics:

- GA ID: `G-DPCDHQYYFF`.
- Loads only on production hosts:
  - `discstacked.app`
  - `www.discstacked.app`
- App sends route-change page views through `window.gtag`.

Command-center tracking requirements:

- GA property owner.
- Whether consent/banner is required.
- Production-only guard status.
- Analytics event roadmap beyond page views.

## Imports, Exports, and Operational Tools

Imports:

- CSV/Excel style imports through `ImportDialog`.
- CLZ Game Collector support is explicitly referenced in settings/import copy.
- VideoGameGeek owned games import through `vgg-collection`.
- Barcode reapply tool scans existing barcoded collection records and updates package-aware metadata.

Exports:

- General CSV export: `discstacked-collection.csv`.
- General JSON export: `discstacked-collection.json`.
- Unstacked-compatible CSV/JSON export for pricing, selling, and auction creation.

Admin/cleanup:

- First admin setup uses `ADMIN_SETUP_PASSWORD`.
- Admin console can list users, inspect roles, and delete users.
- Cleanup tools can merge duplicates, convert slash-title entries, and clean orphan physical products.

## Security, Privacy, and Compliance

Security headers:

- CSP configured in `public/_headers`.
- HSTS preload configured.
- `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
- Camera permission allowed for self, supporting barcode scanning.
- Payment permission disabled.

Authentication:

- Supabase Auth email/password.
- Sign-up tells users to check email for confirmation.
- Password UI requires at least 8 characters, uppercase, lowercase, number, and special character for the displayed strength checklist, though the input `minLength` is 6. Confirm Supabase password policy and align UI/minimums.

Privacy:

- Email and collection data are collected.
- Collection data is private by default.
- Shared collection access is opt-in through unique share links and shared-tab settings.
- Account/data deletion instructions route users to `support@discstacked.app`.

Command-center tracking requirements:

- Auth redirect URL list in Supabase.
- Email template status and sender domain.
- RLS audit status.
- Public function audit status.
- Storage bucket policy audit.
- Secret rotation dates.
- Privacy/terms last reviewed date.
- Data deletion runbook.

## Local Development and Testing

Local requirements:

- Node 22.
- `npm install` or `npm ci`.
- Public Supabase env vars in `.env` or `.env.local`.

Scripts:

- `npm run dev` - Vite dev server.
- `npm run build` - production build.
- `npm run build:cloudflare` - Cloudflare build, currently same as Vite build.
- `npm run build:dev` - development mode build.
- `npm run lint` - ESLint.
- `npm run preview` - Vite preview.
- `npm test` - Vitest.
- `npm run test:watch` - Vitest watch.
- `npm run test:e2e` - Playwright smoke tests.

Test infrastructure:

- Vitest unit tests under `src/test`.
- Playwright e2e under `tests/e2e`.
- Playwright default base URL: `http://127.0.0.1:4173`.
- Playwright starts `npm run dev -- --host 127.0.0.1 --port 4173` unless `PLAYWRIGHT_BASE_URL` is set.

Recommended validation before deploy:

- `npm test`.
- `npm run build`.
- `node_modules/.bin/tsc --noEmit`.
- `node supabase/functions/tmdb-lookup/detection.test.mjs`.
- `npm run test:e2e`.

## Command Center Data Model

Recommended top-level modules:

- Overview: status, current production URL, current deployed commit, current incidents.
- Domains: registrar, renewal, DNS, email routing, DNSSEC.
- Hosting: Cloudflare Pages project, latest deploys, preview URLs, custom domains, headers.
- Source/CI: GitHub repo, branch status, workflows, secrets, checks, releases.
- Backend: Supabase projects, env vars, DB tables, RLS, storage, functions, auth redirects.
- Integrations: API providers, keys, owners, rate limits, health checks.
- Analytics: GA property, event map, privacy requirements.
- Payments: Stripe status, currently not integrated.
- Security: secrets, public functions, RLS/storage audits, CSP/HSTS, incident checklist.
- Legacy systems: Vercel, Lovable, deprecated Supabase refs.
- Product inventory: routes, features, imports/exports, admin tools.
- Operational tasks: cutover/decommission checklist, deploy checklist, regression checklist.

High-priority command-center alerts:

- Domain expires within 60/30/7 days.
- Cloudflare Pages production deploy failed.
- GitHub `main` is behind production or CI failing.
- Stale Supabase project refs remain in repo docs/config after production project correction.
- Missing Cloudflare Pages env vars.
- Supabase Edge Function secret missing.
- Public function changed without auth review.
- RLS policy changed without migration review.
- Secret-like local files detected in repo/workspace.
- Vercel or Lovable still attached after cutover complete.

## Open Questions and Verification Gaps

- Should remaining stale references to Supabase ref `uehokbnqudoabjfzcfaj` be corrected in README, Cloudflare notes, and `supabase/config.toml`?
- Are Cloudflare Pages build variables set for `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`?
- Does the active Cloudflare Pages project have both custom domains attached?
- Is the Vercel project still present, and are the custom domains/env vars removed?
- Is Lovable fully removed from source, lockfiles, and workflow assumptions?
- Who owns the Cloudflare registrar account and domain renewal?
- Are DKIM and DMARC configured for `discstacked.app` email?
- Are Supabase Auth Site URL and redirect URLs updated for Cloudflare production and previews?
- Are all Supabase functions intentionally `verify_jwt = false`?
- Has the token in `supabase auth.txt` been rotated or invalidated?
- Is Stripe intentionally out of scope, or should monetization be added?
- Should Books references and `book-lookup` be removed now that Books live in BookStacked?
- Should README be updated to match current `public-env.ts` behavior around missing public env vars?

## Source Files Consulted

- `README.md`.
- `package.json`.
- `wrangler.toml`.
- `.github/workflows/cloudflare-pages.yml`.
- `docs/cloudflare-pages-migration.md`.
- `docs/decommission-vercel.md`.
- `docs/decommission-lovable.md`.
- `public/_headers`.
- `public/_redirects`.
- `public/analytics.js`.
- `public/manifest.json`.
- `index.html`.
- `src/App.tsx`.
- `src/lib/types.ts`.
- `src/config/public-env.ts`.
- `src/integrations/supabase/client.ts`.
- `src/integrations/supabase/types.ts`.
- `supabase/config.toml`.
- `supabase/migrations/*`.
- `supabase/functions/*`.
