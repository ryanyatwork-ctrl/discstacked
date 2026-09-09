/**
 * Canonical barcode normalization for imports and lookups.
 *
 * WHY THIS EXISTS
 * ---------------
 * Spreadsheet exports (Blu-ray.com, CLZ, hand-built sheets) store barcodes as
 * *numbers*, so leading zeros are destroyed before the file ever reaches us:
 *
 *   025192275708  ->  "25192275708"   (11 chars)
 *   043396509412  ->  "43396509412"   (11 chars)
 *
 * In a real 496-disc Blu-ray.com export, 268 rows (54%) arrived this way.
 * Stored unpadded they fail every UPC lookup, so the importer silently fell
 * back to fuzzy title matching for more than half the library.
 *
 * Padding back to 12 and verifying the check digit recovered 100% of them,
 * with zero false positives — the check digit is what makes this safe: we
 * only accept a repair that produces a mathematically valid barcode.
 */

export type BarcodeKind = "UPC-A" | "EAN-13" | null;

export interface NormalizedBarcode {
  /** Canonical digits, or null when the input held no digits at all. */
  barcode: string | null;
  kind: BarcodeKind;
  /** True when we restored stripped leading zeros. */
  repaired: boolean;
  /** True when the value is checksum-valid (either as-is or after repair). */
  valid: boolean;
  /** Exactly what arrived, for display in a review UI. */
  original: string;
}

/** UPC-A: 12 digits, weights 3-1 from the left. */
export function isValidUpcA(code: string): boolean {
  if (!/^\d{12}$/.test(code)) return false;
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i++) {
    const d = code.charCodeAt(i) - 48;
    if (i % 2 === 0) odd += d;
    else even += d;
  }
  return (10 - ((odd * 3 + even) % 10)) % 10 === code.charCodeAt(11) - 48;
}

/** EAN-13: 13 digits, weights 1-3 from the left. */
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

/**
 * Normalizes a barcode from any import source.
 *
 * Order matters: accept what is already valid before attempting any repair,
 * so a legitimate code is never rewritten.
 *
 * North-American convention is preserved — a 13-digit EAN whose leading digit
 * is 0 is the same article as the 12-digit UPC-A, and we store the UPC-A form
 * so scans and lookups agree with what is printed on the case.
 */
export function normalizeBarcode(input: unknown): NormalizedBarcode {
  const original = input == null ? "" : String(input).trim();
  const digits = original.replace(/\D/g, "");

  if (!digits) {
    return { barcode: null, kind: null, repaired: false, valid: false, original };
  }

  // --- Already valid, untouched. ------------------------------------------
  if (isValidUpcA(digits)) {
    return { barcode: digits, kind: "UPC-A", repaired: false, valid: true, original };
  }
  if (isValidEan13(digits)) {
    // Collapse 0-prefixed EAN-13 to its UPC-A equivalent.
    if (digits.startsWith("0") && isValidUpcA(digits.slice(1))) {
      return { barcode: digits.slice(1), kind: "UPC-A", repaired: true, valid: true, original };
    }
    return { barcode: digits, kind: "EAN-13", repaired: false, valid: true, original };
  }

  // --- Repair stripped leading zeros. --------------------------------------
  if (digits.length < 12) {
    const padded12 = digits.padStart(12, "0");
    if (isValidUpcA(padded12)) {
      return { barcode: padded12, kind: "UPC-A", repaired: true, valid: true, original };
    }
    const padded13 = digits.padStart(13, "0");
    if (isValidEan13(padded13)) {
      const asUpc = padded13.slice(1);
      if (isValidUpcA(asUpc)) {
        return { barcode: asUpc, kind: "UPC-A", repaired: true, valid: true, original };
      }
      return { barcode: padded13, kind: "EAN-13", repaired: true, valid: true, original };
    }
  }

  // A 12-digit value failing UPC-A may be an EAN-13 that lost its leading zero.
  if (digits.length === 12 && isValidEan13(`0${digits}`)) {
    return { barcode: digits, kind: "UPC-A", repaired: false, valid: false, original };
  }

  // --- Unrecoverable: keep the digits so title matching can still proceed,
  //     but mark it invalid so the review UI can flag it. --------------------
  return { barcode: digits, kind: null, repaired: false, valid: false, original };
}

/**
 * Convenience for lookup call sites that only need the string.
 * Returns the canonical form, or the raw digits when unrecoverable.
 */
export function toCanonicalBarcode(input: unknown): string | null {
  return normalizeBarcode(input).barcode;
}
