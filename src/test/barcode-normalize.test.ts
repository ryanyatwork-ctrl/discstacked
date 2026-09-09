import { describe, it, expect } from "vitest";
import {
  normalizeBarcode,
  isValidUpcA,
  isValidEan13,
  isValidBarcode,
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
});

describe("leading-zero repair (the spreadsheet bug)", () => {
  // Real values from a Blu-ray.com export, as Excel emitted them.
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
    expect(r.kind).toBe("UPC-A");
    expect(r.original).toBe(input);
  });
});

describe("values that must not be rewritten", () => {
  it("leaves a valid 12-digit UPC untouched", () => {
    const r = normalizeBarcode("786936773408");
    expect(r.barcode).toBe("786936773408");
    expect(r.repaired).toBe(false);
    expect(r.valid).toBe(true);
  });
  it("keeps a genuine EAN-13", () => {
    const r = normalizeBarcode("5050629351385");
    expect(r.barcode).toBe("5050629351385");
    expect(r.kind).toBe("EAN-13");
    expect(r.repaired).toBe(false);
  });
  it("collapses a 0-prefixed EAN-13 to its UPC-A form", () => {
    const r = normalizeBarcode("0025192275708");
    expect(r.barcode).toBe("025192275708");
    expect(r.kind).toBe("UPC-A");
    expect(r.valid).toBe(true);
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
    const r = normalizeBarcode("99999999999");
    expect(r.valid).toBe(false);
    expect(r.barcode).toBe("99999999999");
    expect(r.kind).toBeNull();
  });
  it("never invents a valid code from garbage", () => {
    // Padding must only be accepted when the checksum agrees.
    expect(normalizeBarcode("12345").valid).toBe(false);
  });
});
