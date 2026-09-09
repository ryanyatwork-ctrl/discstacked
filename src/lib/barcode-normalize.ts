/**
 * Canonical barcode normalization for imports and lookups.
 *
 * TWO DISTINCT CORRUPTIONS
 * ------------------------
 * 1. LEADING-ZERO LOSS (11 digits). Spreadsheets store barcodes as numbers,
 *    so "025192275708" arrives as "25192275708". In a real 496-disc
 *    Blu-ray.com export this hit 268 rows (54%). Safe to repair: the check
 *    digit survived, so a padded candidate is self-validating.
 *
 * 2. TRUNCATED CORE (10 digits). Some sources store only the middle of the
 *    code — the leading number-system digit AND the trailing check digit are
 *    both gone. "2454375296" is really 024543752967 (20th Century Fox).
 *    This is NOT safe to repair by padding, and the reason matters:
 *
 *      Spider-Man: No Way Home stored "4339657898".
 *        zero-pad  -> 004339657898  <- PASSES the check digit, prefix 004339
 *                                      belongs to no studio. Wrong disc.
 *        reconstruct -> 043396578982 <- Sony Pictures. Correct.
 *
 *    Both are checksum-valid. A check digit proves a code is well-FORMED,
 *    never that it is the RIGHT product, and a valid-but-wrong barcode is
 *    worse than a broken one because nothing downstream questions it.
 *
 * So a 10-digit input is treated as AMBIGUOUS: we return ranked candidates
 * and refuse to pick one silently. The caller must disambiguate — by title
 * corroboration (see barcode-backfill.ts) or by asking the user.
 */

export type BarcodeKind = "UPC-A" | "EAN-13" | null;

export type RepairStrategy =
  | "none"          // already valid
  | "zero-pad"      // restored stripped leading zeros
  | "ean-to-upc"    // 0-prefixed EAN-13 collapsed to UPC-A
  | "reconstruct";  // rebuilt number-system + check digit around a 10-digit core

export interface BarcodeCandidate {
  barcode: string;
  kind: Exclude<BarcodeKind, null>;
  strategy: RepairStrategy;
  /** Company prefix, when it matches one seen in this collection. */
  prefixOwner?: string;
  /** Higher is better. Known prefixes rank above unknown ones. */
  score: number;
}

export interface NormalizedBarcode {
  barcode: string | null;
  kind: BarcodeKind;
  repaired: boolean;
  valid: boolean;
  original: string;
  /** True when more than one reading is plausible — do NOT auto-apply. */
  ambiguous: boolean;
  /** Ranked readings, best first. Populated when ambiguous. */
  candidates: BarcodeCandidate[];
  strategy: RepairStrategy;
}

/**
 * GS1 company prefixes observed in this collection's own checksum-valid
 * barcodes. This is a ranking hint, not an authority: an unknown prefix is
 * never rejected, it just loses a tie-break to a known one. Extend freely —
 * regenerate by grouping validated 12-digit codes on substr(1,6).
 */
export const KNOWN_UPC_PREFIXES: Record<string, string> = {
  "024543": "20th Century Fox",
  "883929": "Warner Bros.",
  "786936": "Disney / Buena Vista",
  "191329": "Universal / NBCU",
  "043396": "Sony Pictures",
  "025192": "Universal Studios",
  "794043": "Shout! Factory",
  "031398": "Lionsgate",
  "032429": "Kino Lorber",
  "883904": "Well Go / indie",
  "683904": "Sentai / indie",
  "013138": "Image Entertainment",
  "013132": "Image Entertainment",
  "013131": "Image Entertainment",
  "012236": "Anchor Bay",
  "096009": "Vinegar Syndrome",
  "097361": "Paramount",
};

// -------------------------------------------------------------- check digits

export function upcCheckDigit(first11: string): number {
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i++) {
    const d = first11.charCodeAt(i) - 48;
    if (i % 2 === 0) odd += d;
    else even += d;
  }
  return (10 - ((odd * 3 + even) % 10)) % 10;
}

export function isValidUpcA(code: string): boolean {
  if (!/^\d{12}$/.test(code)) return false;
  return upcCheckDigit(code.slice(0, 11)) === code.charCodeAt(11) - 48;
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 12; i++) {
    const d = code.charCodeAt(i) - 48;
    if (i % 2 === 0) odd += d;
    else even += d;
  }
  return (10 - ((odd + even * 3) % 10)) % 10 === code.charCodeAt(12) - 48;
}

export function isValidBarcode(code: string): boolean {
  return isValidUpcA(code) || isValidEan13(code);
}

// ------------------------------------------------------------ reconstruction

/**
 * Rebuilds full UPC-A candidates from a 10-digit core that lost both its
 * number-system digit and its check digit.
 *
 * Every number-system digit 0-9 yields exactly one checksum-valid code, so
 * the check digit cannot discriminate between them — only the company prefix
 * and, ultimately, a title lookup can. Candidates whose prefix is known to
 * this collection rank first.
 */
export function reconstructFromCore10(core: string): BarcodeCandidate[] {
  if (!/^\d{10}$/.test(core)) return [];

  const out: BarcodeCandidate[] = [];
  for (let d = 0; d <= 9; d++) {
    const first11 = `${d}${core}`;
    const full = `${first11}${upcCheckDigit(first11)}`;
    const owner = KNOWN_UPC_PREFIXES[full.slice(0, 6)];
    out.push({
      barcode: full,
      kind: "UPC-A",
      strategy: "reconstruct",
      prefixOwner: owner,
      score: owner ? 100 : 10,
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------ main

export function normalizeBarcode(input: unknown): NormalizedBarcode {
  const original = input == null ? "" : String(input).trim();
  const digits = original.replace(/\D/g, "");

  const base: NormalizedBarcode = {
    barcode: null, kind: null, repaired: false, valid: false,
    original, ambiguous: false, candidates: [], strategy: "none",
  };

  if (!digits) return base;

  // --- Already valid. -----------------------------------------------------
  if (isValidUpcA(digits)) {
    return { ...base, barcode: digits, kind: "UPC-A", valid: true };
  }
  if (isValidEan13(digits)) {
    // Collapse 0-prefixed EAN-13 to its UPC-A equivalent so scans and
    // imports agree on one identity for the same disc.
    if (digits.startsWith("0") && isValidUpcA(digits.slice(1))) {
      return {
        ...base, barcode: digits.slice(1), kind: "UPC-A",
        repaired: true, valid: true, strategy: "ean-to-upc",
      };
    }
    return { ...base, barcode: digits, kind: "EAN-13", valid: true };
  }

  // --- 11 digits: leading-zero loss. Safe, the check digit survived. -------
  if (digits.length === 11) {
    const padded = digits.padStart(12, "0");
    if (isValidUpcA(padded)) {
      return {
        ...base, barcode: padded, kind: "UPC-A",
        repaired: true, valid: true, strategy: "zero-pad",
      };
    }
  }

  // --- 10 digits: AMBIGUOUS. Never auto-resolve. --------------------------
  if (digits.length === 10) {
    const candidates: BarcodeCandidate[] = [];

    // Reading A: lost two leading zeros (check digit survived).
    const padded = digits.padStart(12, "0");
    if (isValidUpcA(padded)) {
      const owner = KNOWN_UPC_PREFIXES[padded.slice(0, 6)];
      candidates.push({
        barcode: padded, kind: "UPC-A", strategy: "zero-pad",
        prefixOwner: owner,
        // A valid checksum here is often coincidence (1 in 10), so an
        // unknown prefix scores below any recognised-prefix reconstruction.
        score: owner ? 90 : 5,
      });
    }

    // Reading B: lost number-system digit and check digit.
    candidates.push(...reconstructFromCore10(digits));
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];

    return {
      ...base,
      barcode: best?.barcode ?? digits,
      kind: best ? best.kind : null,
      repaired: false,
      // A single recognised prefix is a strong signal, but a title check
      // still decides — the caller sees ambiguous:true either way.
      valid: false,
      ambiguous: true,
      candidates,
      strategy: best?.strategy ?? "none",
    };
  }

  // --- 12 digits failing UPC: possibly an EAN-13 missing a leading zero. ---
  if (digits.length === 12 && isValidEan13(`0${digits}`)) {
    return {
      ...base, barcode: `0${digits}`, kind: "EAN-13",
      repaired: true, valid: true, strategy: "zero-pad",
    };
  }

  // --- Unrecoverable: keep digits so title matching can still proceed. -----
  return { ...base, barcode: digits };
}

/** Convenience for call sites that only need a string and accept the risk. */
export function toCanonicalBarcode(input: unknown): string | null {
  const r = normalizeBarcode(input);
  // Never hand back an unconfirmed guess as if it were fact.
  return r.valid ? r.barcode : null;
}
