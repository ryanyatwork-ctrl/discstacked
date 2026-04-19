# Lovable Decommission Checklist

This checklist is for removing Lovable from the repository and day-to-day workflow, not for deleting any unrelated historical exports a teammate may still want locally.

## Repository cleanup

1. Remove tracked Lovable-specific packages, lockfile entries, or private registry references.
2. Remove tracked Lovable-specific URLs, comments, user-agent strings, docs, and workflow assumptions.
3. Keep only the standard package manager lockfile you actually use for this repo.
4. Confirm CI, local dev, and Cloudflare deploys do not depend on Lovable tooling.

## Local workspace cleanup

These items are safe to delete only if you no longer need them for migration history:

- `export_lovable_data.mjs`
- `export_lovable_data.py`
- any JSON exports created purely for Lovable migration work
- any local notes or prompts that only exist to support the old Lovable workflow

## Workflow cleanup

1. Stop using Lovable deploy previews, domains, or generated environment assumptions as a source of truth.
2. Treat GitHub + Cloudflare Pages + Supabase as the canonical deployment path.
3. If teammates still have personal Lovable bookmarks, automations, or docs for this app, retire them now to avoid split-brain operations.

## Done state

Lovable is fully decommissioned for this project when:

- no tracked source file references Lovable
- no tracked lockfile contains Lovable-specific registry or package entries
- no deploy or release step depends on Lovable
- any remaining Lovable artifacts are intentionally kept only as optional local historical files
