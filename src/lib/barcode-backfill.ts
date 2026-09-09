/**
 * One-time repair for barcodes stored before the leading-zero import fix.
 *
 * WHY THIS IS SEPARATE FROM barcode-reapply.ts
 * --------------------------------------------
 * reapplyBarcodeDetailsForUser() groups rows by their *existing* barcode and
 * re-runs lookupBarcode() on it. When the stored value is the unpadded form
 * ("25192275708"), that lookup fails for the same reason the original import
 * did — so reapply can never repair these rows on its own.
 *
 * Correct order:
 *   1. repairBarcodesForUser()          <- fix the stored identifiers
 *   2. reapplyBarcodeDetailsForUser()   <- now the lookups resolve
 *
 * TITLE CORROBORATION — why a check digit is not enough
 * -----------------------------------------------------
 * A check digit proves a barcode is well-FORMED, not that it is the RIGHT
 * disc. Zero-padding "31398195238" to "031398195238" yields a checksum-valid
 * code, but so would padding some other truncated value — and a valid code
 * pointing at the wrong film is worse than an obviously broken one, because
 * nothing downstream will ever question it.
 *
 * So every repair is corroborated against the title already stored on the
 * same row: we look the candidate barcode up and compare what comes back to
 * what the user has. Agreement confirms the repair. Disagreement blocks it
 * and sends the row to review. A lookup that returns nothing can neither
 * confirm nor refute, so the checksum-valid repair is applied but marked
 * unverified — configurable via `applyUnverified`.
 *
 * SAFETY
 * ------
 * Defaults to a dry run. Nothing is written unless the caller passes
 * { dryRun: false }. Writes are scoped by user_id as well as row id.
 *
 * Collisions are reported, never resolved. If a repair lands on a barcode
 * another row already holds, that is a real duplicate needing a merge
 * decision — collapseDuplicateProducts() in barcode-reapply.ts is the tool
 * for that, and it should be deliberate, not a side effect of a repair.
 */

import { supabase } from "@/integrations/supabase/client";
import { normalizeBarcode, type BarcodeCandidate } from "@/lib/barcode-normalize";
import { lookupBarcode } from "@/lib/media-lookup";
import type { MediaTab } from "@/lib/types";

const BARCODE_MEDIA_TYPES: MediaTab[] = ["movies", "music-films", "cds"];
const PAGE_SIZE = 1000;

/** Concurrent lookups during verification. Kept low to stay polite to the API. */
const LOOKUP_CONCURRENCY = 4;

/** Token-overlap score above which two titles are considered the same work. */
const TITLE_MATCH_THRESHOLD = 0.6;

export type RepairTable = "media_items" | "physical_products";

export type VerificationStatus =
  | "confirmed"    // lookup title corroborates the stored title
  | "mismatch"     // lookup succeeded and disagrees — repair withheld
  | "unverified"   // lookup returned nothing; checksum-valid but uncorroborated
  | "unresolved"   // ambiguous, and no candidate's title corroborated
  | "skipped";     // verification disabled by the caller

interface Row {
  id: string;
  title: string | null;
  barcode: string | null;
  media_type: string | null;
}

export interface BarcodeRepair {
  table: RepairTable;
  id: string;
  title: string | null;
  mediaType: string | null;
  from: string;
  to: string;
  kind: "UPC-A" | "EAN-13";
  verification: VerificationStatus;
  /** Title the lookup returned, when there was one. */
  lookupTitle?: string | null;
  titleScore?: number;
  /**
   * Set when the stored value was a 10-digit core with several checksum-valid
   * readings. `to` holds the best guess only until a lookup picks a winner;
   * an unresolved candidate is never applied.
   */
  pending?: BarcodeCandidate[];
}

export interface BarcodeMismatch {
  table: RepairTable;
  id: string;
  storedTitle: string | null;
  lookupTitle: string;
  from: string;
  to: string;
  titleScore: number;
}

export interface BarcodeCollision {
  table: RepairTable;
  id: string;
  title: string | null;
  from: string;
  to: string;
  conflictsWith: Array<{ id: string; title: string | null }>;
}

export interface UnrepairableBarcode {
  table: RepairTable;
  id: string;
  title: string | null;
  barcode: string;
  reason: string;
}

export interface BarcodeBackfillReport {
  dryRun: boolean;
  verified: boolean;
  scanned: number;
  alreadyValid: number;
  repairs: BarcodeRepair[];
  mismatches: BarcodeMismatch[];
  collisions: BarcodeCollision[];
  unrepairable: UnrepairableBarcode[];
  applied: number;
  failures: Array<{ id: string; table: RepairTable; error: string }>;
}

export interface BackfillOptions {
  /** Defaults to true. Nothing is written unless explicitly false. */
  dryRun?: boolean;
  /** Corroborate each repair against the row's title. Defaults to true. */
  verifyTitles?: boolean;
  /** Apply repairs the lookup could not corroborate. Defaults to true. */
  applyUnverified?: boolean;
  onProgress?: (message: string) => void;
}

// ------------------------------------------------------------ title match

function normalizeTitle(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\b(blu-?ray|dvd|4k|uhd|digital|steelbook|edition|collection)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Token-overlap similarity (0..1). Deliberately simple and dependency-free:
 * we only need "is this plausibly the same work", not ranked search.
 * Containment scores 1 so "Alien" matches "Alien: Director's Cut".
 */
export function titleSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;

  // One title fully containing the other counts as a match.
  if (shared === Math.min(ta.size, tb.size)) return 1;

  return (2 * shared) / (ta.size + tb.size);
}

/** Pulls whatever title a lookup result carries, across its result shapes. */
function extractLookupTitle(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, any>;
  const candidate =
    r.direct?.title ??
    r.multiMovie?.product_title ??
    r.multiMovie?.collection_name ??
    r.multiMovie?.barcode_title ??
    r.multiSeason?.product_title ??
    r.multiSeason?.barcode_title ??
    null;
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

// ----------------------------------------------------------------- fetch

async function fetchAllBarcoded(table: RepairTable, userId: string): Promise<Row[]> {
  // physical_products stores its name in product_title, media_items in title.
  const titleCol = table === "physical_products" ? "product_title" : "title";
  const all: Row[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${titleCol}, barcode, media_type`)
      .eq("user_id", userId)
      .in("media_type", BARCODE_MEDIA_TYPES)
      .not("barcode", "is", null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    // The select list is built dynamically, so the generated row type
    // cannot be inferred here; widen through unknown deliberately.
    const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
    if (rows.length === 0) break;

    for (const r of rows) {
      all.push({
        id: String(r.id),
        title: (r[titleCol] as string | null) ?? null,
        barcode: (r.barcode as string | null) ?? null,
        media_type: (r.media_type as string | null) ?? null,
      });
    }

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ------------------------------------------------------------------ main

/** Read-only. Safe against production at any time. */
export async function analyzeBarcodeRepairs(
  userId: string,
  onProgress?: (message: string) => void,
): Promise<BarcodeBackfillReport> {
  return repairBarcodesForUser(userId, { dryRun: true, onProgress });
}

export async function repairBarcodesForUser(
  userId: string,
  options: BackfillOptions = {},
): Promise<BarcodeBackfillReport> {
  const dryRun = options.dryRun !== false;
  const verifyTitles = options.verifyTitles !== false;
  const applyUnverified = options.applyUnverified !== false;
  const progress = options.onProgress ?? (() => {});

  const report: BarcodeBackfillReport = {
    dryRun,
    verified: verifyTitles,
    scanned: 0,
    alreadyValid: 0,
    repairs: [],
    mismatches: [],
    collisions: [],
    unrepairable: [],
    applied: 0,
    failures: [],
  };

  progress("Loading barcoded rows…");

  const [items, products] = await Promise.all([
    fetchAllBarcoded("media_items", userId),
    fetchAllBarcoded("physical_products", userId),
  ]);

  const sets: Array<{ table: RepairTable; rows: Row[] }> = [
    { table: "media_items", rows: items },
    { table: "physical_products", rows: products },
  ];

  const candidates: BarcodeRepair[] = [];

  for (const { table, rows } of sets) {
    const existing = new Map<string, Array<{ id: string; title: string | null }>>();
    for (const r of rows) {
      if (!r.barcode) continue;
      const key = `${r.media_type ?? ""}:${r.barcode}`;
      const list = existing.get(key) ?? [];
      list.push({ id: r.id, title: r.title });
      existing.set(key, list);
    }

    for (const row of rows) {
      const stored = (row.barcode ?? "").trim();
      if (!stored) continue;
      report.scanned++;

      const normalized = normalizeBarcode(stored);

      if (normalized.valid && normalized.barcode === stored) {
        report.alreadyValid++;
        continue;
      }

      // A 10-digit core has several checksum-valid readings; only a lookup
      // can choose between them. Defer to the verification pass rather than
      // guessing, and drop it entirely if titles cannot settle it.
      if (normalized.ambiguous && normalized.candidates.length) {
        candidates.push({
          table,
          id: row.id,
          title: row.title,
          mediaType: row.media_type,
          from: stored,
          to: normalized.candidates[0].barcode, // provisional only
          kind: "UPC-A",
          verification: "skipped",
          pending: normalized.candidates,
        });
        continue;
      }

      if (!normalized.valid || !normalized.barcode) {
        report.unrepairable.push({
          table,
          id: row.id,
          title: row.title,
          barcode: stored,
          reason:
            "No zero-padding or reconstruction produces a valid check digit. " +
            "Needs the disc checking by hand, or matching on title instead.",
        });
        continue;
      }

      const target = normalized.barcode;
      const conflicts = (existing.get(`${row.media_type ?? ""}:${target}`) ?? [])
        .filter((c) => c.id !== row.id);

      if (conflicts.length > 0) {
        report.collisions.push({
          table, id: row.id, title: row.title, from: stored, to: target,
          conflictsWith: conflicts,
        });
        continue;
      }

      candidates.push({
        table,
        id: row.id,
        title: row.title,
        mediaType: row.media_type,
        from: stored,
        to: target,
        kind: normalized.kind as "UPC-A" | "EAN-13",
        verification: "skipped",
      });
    }
  }

  progress(
    `Scanned ${report.scanned} · ${report.alreadyValid} already valid · ` +
      `${candidates.length} candidates · ${report.collisions.length} collisions · ` +
      `${report.unrepairable.length} unrepairable`,
  );

  // --- Corroborate each candidate against the title on the same row. -------
  if (verifyTitles && candidates.length) {
    progress(`Verifying ${candidates.length} candidates against their titles…`);
    let done = 0;

    await mapWithConcurrency(candidates, LOOKUP_CONCURRENCY, async (cand) => {
      const tab = (cand.mediaType as MediaTab) || "movies";

      // --- Ambiguous 10-digit core: try each reading until one's title
      //     corroborates the row. Best-ranked (known studio prefix) first,
      //     so the likely answer usually costs a single lookup.
      if (cand.pending?.length) {
        for (const option of cand.pending) {
          try {
            const result = await lookupBarcode(tab, option.barcode);
            const lookupTitle = extractLookupTitle(result);
            if (!lookupTitle) continue;

            const score = titleSimilarity(cand.title, lookupTitle);
            if (score >= TITLE_MATCH_THRESHOLD) {
              cand.to = option.barcode;
              cand.lookupTitle = lookupTitle;
              cand.titleScore = score;
              cand.verification = "confirmed";
              break;
            }
          } catch {
            // Try the next reading.
          }
        }
        // Nothing corroborated: leave the row alone rather than guessing.
        if (cand.verification !== "confirmed") cand.verification = "unresolved";
        done++;
        if (done % 25 === 0) progress(`Verified ${done}/${candidates.length}…`);
        return;
      }

      try {
        const result = await lookupBarcode(tab, cand.to);
        const lookupTitle = extractLookupTitle(result);

        if (!lookupTitle) {
          cand.verification = "unverified";
        } else {
          const score = titleSimilarity(cand.title, lookupTitle);
          cand.lookupTitle = lookupTitle;
          cand.titleScore = score;
          cand.verification = score >= TITLE_MATCH_THRESHOLD ? "confirmed" : "mismatch";
        }
      } catch {
        // A failed lookup is not evidence against the repair.
        cand.verification = "unverified";
      }

      done++;
      if (done % 25 === 0) progress(`Verified ${done}/${candidates.length}…`);
    });
  }

  for (const cand of candidates) {
    if (cand.verification === "mismatch") {
      report.mismatches.push({
        table: cand.table,
        id: cand.id,
        storedTitle: cand.title,
        lookupTitle: cand.lookupTitle ?? "",
        from: cand.from,
        to: cand.to,
        titleScore: cand.titleScore ?? 0,
      });
      continue; // never auto-apply a repair the title contradicts
    }

    // An ambiguous core is only ever applied when a lookup positively
    // identified which reading is right. Unresolved — or verification turned
    // off, leaving it "skipped" — means we still don't know, so leave it.
    if (cand.pending?.length && cand.verification !== "confirmed") {
      report.unrepairable.push({
        table: cand.table,
        id: cand.id,
        title: cand.title,
        barcode: cand.from,
        reason:
          `Ten-digit code with ${cand.pending.length} checksum-valid readings ` +
          `(best guess ${cand.pending[0].barcode}` +
          `${cand.pending[0].prefixOwner ? `, ${cand.pending[0].prefixOwner}` : ""}). ` +
          `No lookup corroborated the title, so the row was left unchanged.`,
      });
      continue;
    }

    if (cand.verification === "unverified" && !applyUnverified) continue;
    report.repairs.push(cand);
  }

  progress(
    `${report.repairs.length} to apply · ${report.mismatches.length} blocked by title mismatch`,
  );

  if (dryRun) {
    progress("Dry run — nothing written.");
    return report;
  }

  progress(`Applying ${report.repairs.length} repairs…`);

  for (const repair of report.repairs) {
    const { error } = await supabase
      .from(repair.table)
      .update({ barcode: repair.to })
      .eq("id", repair.id)
      .eq("user_id", userId); // defence in depth

    if (error) {
      report.failures.push({ id: repair.id, table: repair.table, error: error.message });
    } else {
      report.applied++;
      if (report.applied % 50 === 0) {
        progress(`Repaired ${report.applied}/${report.repairs.length}…`);
      }
    }
  }

  progress(
    `Done. Repaired ${report.applied}, ${report.failures.length} failed. ` +
      `Run "Reapply barcode details" next to refresh metadata for the fixed rows.`,
  );

  return report;
}

/** Compact human-readable summary for logs or a settings panel. */
export function formatBackfillReport(r: BarcodeBackfillReport): string {
  const lines = [
    `${r.dryRun ? "DRY RUN" : "APPLIED"} — scanned ${r.scanned} barcoded rows` +
      `${r.verified ? " (titles verified)" : " (no title verification)"}`,
    `  already valid : ${r.alreadyValid}`,
    `  to repair     : ${r.repairs.length}`,
    `  title mismatch: ${r.mismatches.length}   <- blocked, needs review`,
    `  collisions    : ${r.collisions.length}`,
    `  unrepairable  : ${r.unrepairable.length}`,
  ];

  if (!r.dryRun) {
    lines.push(`  applied       : ${r.applied}`, `  failures      : ${r.failures.length}`);
  }

  const confirmed = r.repairs.filter((x) => x.verification === "confirmed").length;
  const unverified = r.repairs.filter((x) => x.verification === "unverified").length;
  if (r.verified) {
    lines.push("", `  confirmed by title: ${confirmed}`, `  uncorroborated    : ${unverified}`);
  }

  if (r.mismatches.length) {
    lines.push("", "Title mismatches (barcode valid but points elsewhere):");
    for (const m of r.mismatches.slice(0, 10)) {
      lines.push(
        `  ${m.from} -> ${m.to}  stored "${m.storedTitle ?? "?"}" vs lookup ` +
          `"${m.lookupTitle}" (score ${m.titleScore.toFixed(2)})`,
      );
    }
  }

  if (r.collisions.length) {
    lines.push("", "Collisions (need a merge decision):");
    for (const c of r.collisions.slice(0, 10)) {
      lines.push(
        `  ${c.from} -> ${c.to}  ${c.title ?? "(untitled)"} conflicts with ` +
          `${c.conflictsWith.length} row(s)`,
      );
    }
  }

  return lines.join("\n");
}
