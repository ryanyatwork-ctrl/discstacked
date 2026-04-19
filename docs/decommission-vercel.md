# Vercel Decommission Checklist

Use this only after Cloudflare Pages production is healthy and the Cloudflare deployment path is the only path you intend to keep.

## Safe-to-delete gate

All of the following should be true before deleting the Vercel project:

- `https://discstacked.app` and `https://www.discstacked.app` load the app from Cloudflare Pages without runtime errors.
- At least one fresh `main` deployment from GitHub Actions has completed successfully on Cloudflare after the final cleanup branch merged.
- At least one non-`main` branch push has produced a working Cloudflare Pages preview deployment.
- Supabase Auth Site URL and redirect URLs include the Cloudflare production domain and the Pages preview hostname pattern you rely on.
- No production DNS records still point to Vercel.
- No team member still needs Vercel preview URLs for rollback or comparison.

## Exact teardown steps

1. In Vercel project settings for `discstacked`, remove the custom domains `discstacked.app` and `www.discstacked.app`.
2. Confirm the domains remain attached only in Cloudflare and still resolve correctly there.
3. Remove any Vercel environment variables that were created only for this project.
4. Disable or remove any Git integration hooks that still auto-deploy the repo to Vercel.
5. Remove any Vercel-specific web analytics, speed insights, or monitoring integrations if they are still enabled for this project.
6. Export or note any deployment history you want to keep for audit purposes.
7. Delete the Vercel project `discstacked`.
8. After deletion, verify that the old Vercel hostnames return inactive/not found and that `discstacked.app` and `www.discstacked.app` still serve Cloudflare content.

## Recommended timing

Delete the Vercel project only after the runtime config fallback and security-header changes from this phase are deployed to Cloudflare and verified on production. Right now, keeping the Vercel project around as a rollback reference is low risk, but deleting it before Cloudflare production is confirmed healthy removes an escape hatch.
