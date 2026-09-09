import { describe, it, expect } from "vitest";
import {
  normalizeBarcode,
  reconstructFromCore10,
  upcCheckDigit,
  isValidUpcA,
  isValidEan13,
  isValidBarcode,
  KNOWN_UPC_PREFIXES,
} from "@/lib/barcode-normalize";

describe("check digits", () => {
  it("validates known-good UPC-A", () => {
    expect(isValidUpcA("025192275708")).toBe(true);
    expect(isValidUpcA("786936773408")).toBe(true);
  });
  it("rejects a bad UPC-A check digit", () => {
    expect(isValidUpcA("025192275709")).toBe(false);
  });
  it("rejects wrong lengths and non-digits", () => {
    expect(isValidUpcA("2519227570")).toBe(false);
    expect(isValidUpcA("02519227570A")).toBe(false);
  });
  it("validates known-good EAN-13", () => {
    expect(isValidEan13("5050629351385")).toBe(true);
    expect(isValidEan13("9325336164617")).toBe(true);
  });
  it("isValidBarcode accepts either", () => {
    expect(isValidBarcode("025192275708")).toBe(true);
    expect(isValidBarcode("5050629351385")).toBe(true);
    expect(isValidBarcode("12345")).toBe(false);
  });
  it("computes the check digit", () => {
    expect(upcCheckDigit("02519227570")).toBe(8);
  });
});

describe("11-digit leading-zero repair (safe: check digit survived)", () => {
  const cases: Array<[string, string]> = [
    ["25192275708", "025192275708"],
    ["43396509412", "043396509412"],
    ["24543589167", "024543589167"],
    ["31398195238", "031398195238"],
  ];
  it.each(cases)("restores %s -> %s", (input, expected) => {
    const r = normalizeBarcode(input);
    expect(r.barcode).toBe(expected);
    expect(r.valid).toBe(true);
    expect(r.repaired).toBe(true);
    expect(r.ambiguous).toBe(false);
    expect(r.strategy).toBe("zero-pad");
  });
});

describe("10-digit truncated core is AMBIGUOUS, never auto-applied", () => {
  // Real rows from the live collection.
  const cases: Array<[string, string, string]> = [
    ["2454375296", "024543752967", "20th Century Fox"],
    ["8693686368", "786936863680", "Disney / Buena Vista"],
    ["4339658160", "043396581609", "Sony Pictures"],
    ["2454388006", "024543880066", "20th Century Fox"],
  ];

  it.each(cases)("%s reconstructs to %s (%s)", (core, expected, owner) => {
    const r = normalizeBarcode(core);
    expect(r.ambiguous).toBe(true);
    expect(r.valid).toBe(false);          // must not be treated as settled
    expect(r.barcode).toBe(expected);     // best candidate
    expect(r.candidates[0].prefixOwner).toBe(owner);
    expect(r.candidates[0].strategy).toBe("reconstruct");
  });

  it("REGRESSION: a coincidentally-valid zero-pad must not win", () => {
    // "4339657898" zero-pads to 004339657898, which PASSES the check digit
    // but has prefix 004339 (no studio). The Sony reconstruction is correct.
    const r = normalizeBarcode("4339657898");
    expect(isValidUpcA("004339657898")).toBe(true); // the trap
    expect(r.ambiguous).toBe(true);
    expect(r.barcode).toBe("043396578982");
    expect(r.candidates[0].prefixOwner).toBe("Sony Pictures");
    const zeroPad = r.candidates.find((c) => c.strategy === "zero-pad");
    expect(zeroPad?.barcode).toBe("004339657898");
    expect(zeroPad!.score).toBeLessThan(r.candidates[0].score);
  });

  it("offers one valid candidate per number-system digit", () => {
    const cands = reconstructFromCore10("2454375296");
    expect(cands).toHaveLength(10);
    for (const c of cands) expect(isValidUpcA(c.barcode)).toBe(true);
  });

  it("toCanonicalBarcode refuses to return an unconfirmed guess", async () => {
    const { toCanonicalBarcode } = await import("@/lib/barcode-normalize");
    expect(toCanonicalBarcode("2454375296")).toBeNull();
    expect(toCanonicalBarcode("25192275708")).toBe("025192275708");
  });
});

describe("values that must not be rewritten", () => {
  it("leaves a valid 12-digit UPC untouched", () => {
    const r = normalizeBarcode("786936773408");
    expect(r.barcode).toBe("786936773408");
    expect(r.repaired).toBe(false);
    expect(r.valid).toBe(true);
  });
  it("keeps a genuine EAN-13 (European releases)", () => {
    const r = normalizeBarcode("5050629351385");
    expect(r.barcode).toBe("5050629351385");
    expect(r.kind).toBe("EAN-13");
    expect(r.repaired).toBe(false);
  });
  it("collapses a 0-prefixed EAN-13 to its UPC-A form", () => {
    const r = normalizeBarcode("0025192275708");
    expect(r.barcode).toBe("025192275708");
    expect(r.kind).toBe("UPC-A");
    expect(r.strategy).toBe("ean-to-upc");
  });
});

describe("robustness", () => {
  it("strips formatting characters", () => {
    expect(normalizeBarcode(" 0-25192-27570-8 ").barcode).toBe("025192275708");
  });
  it("handles empty and nullish input", () => {
    for (const v of ["", "   ", null, undefined]) {
      const r = normalizeBarcode(v);
      expect(r.barcode).toBeNull();
      expect(r.valid).toBe(false);
    }
  });
  it("keeps unrecoverable digits but marks them invalid", () => {
    const r = normalizeBarcode("999999999999");
    expect(r.valid).toBe(false);
    expect(r.ambiguous).toBe(false);
  });
  it("prefix table covers the studios seen in this collection", () => {
    expect(Object.keys(KNOWN_UPC_PREFIXES).length).toBeGreaterThanOrEqual(15);
  });
});
