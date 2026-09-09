import { describe, it, expect } from "vitest";
import {
  preflightImport,
  preflightHeadline,
  formatPreflightReport,
} from "@/lib/import-preflight";

const HEADERS = [
  "Title", "Movie Release Year", "Blu-Ray Release Year", "Format", "Barcode",
  "Disc Count", "Case Type", "Slipcover", "Digital Code Status",
  "Digital Platform", "Studio / Distributor",
];

const row = (o: Partial<Record<string, string>>) =>
  HEADERS.map((h) => o[h] ?? "");

describe("preflight verdicts", () => {
  it("passes a clean row with no issues", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "Jaws", "Movie Release Year": "1975", Format: "BLU-RAY", Barcode: "025192275708" }),
    ]);
    expect(r.totalRows).toBe(1);
    expect(r.clean).toBe(1);
    expect(r.willFail).toBe(0);
    expect(preflightHeadline(r)).toContain("look good");
  });

  it("blocks a row with no title and says so", () => {
    const r = preflightImport(HEADERS, [
      row({ Format: "BLU-RAY", Barcode: "025192275708" }),
    ]);
    expect(r.willFail).toBe(1);
    expect(r.willImport).toBe(0);
    expect(r.issues[0].code).toBe("MISSING_TITLE");
    expect(r.issues[0].severity).toBe("blocker");
  });

  it("reports the spreadsheet row number, not the array index", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "A", "Movie Release Year": "2000", Format: "BLU-RAY", Barcode: "025192275708" }),
      row({ Title: "", Format: "BLU-RAY" }),
    ]);
    // Header is row 1, so the second data row is sheet row 3.
    expect(r.issues.find((i) => i.code === "MISSING_TITLE")!.sheetRow).toBe(3);
  });

  it("warns on a missing format and explains the default", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "Heat", "Movie Release Year": "1995", Barcode: "025192275708" }),
    ]);
    const i = r.issues.find((x) => x.code === "NO_FORMAT")!;
    expect(i.severity).toBe("warning");
    expect(i.message).toContain("default to Blu-ray");
    expect(i.suggestion).toBeTruthy();
  });

  it("flags an ambiguous 10-digit barcode without committing to a reading", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "Young Frankenstein", "Movie Release Year": "1974", Format: "BLU-RAY", Barcode: "2454388006" }),
    ]);
    const i = r.issues.find((x) => x.code === "BARCODE_AMBIGUOUS")!;
    expect(i.severity).toBe("warning");
    expect(i.message).toContain("024543880066");
  });

  it("notes a repaired barcode as info, not a problem", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "Jaws", "Movie Release Year": "1975", Format: "BLU-RAY", Barcode: "25192275708" }),
    ]);
    const i = r.issues.find((x) => x.code === "BARCODE_REPAIRED")!;
    expect(i.severity).toBe("info");
    expect(r.willFail).toBe(0);
  });

  it("treats a missing film year as fine when a package year exists", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "Bond Collection", "Movie Release Year": "0",
            "Blu-Ray Release Year": "October 26 2010", Format: "BLU-RAY", Barcode: "025192275708" }),
    ]);
    expect(r.issues.some((i) => i.code === "YEAR_FROM_PACKAGE")).toBe(true);
    expect(r.issues.some((i) => i.code === "NO_YEAR")).toBe(false);
    expect(r.withWarnings).toBe(0);
  });

  it("warns when there is no year of any kind", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "Mystery Set", Format: "BLU-RAY", Barcode: "025192275708" }),
    ]);
    expect(r.issues.some((i) => i.code === "NO_YEAR")).toBe(true);
  });

  it("detects rows that will merge on a shared barcode", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "Crash", "Movie Release Year": "2004", Format: "BLU-RAY", Barcode: "031398195238" }),
      row({ Title: "Crash", "Movie Release Year": "2004", Format: "DVD", Barcode: "031398195238" }),
    ]);
    expect(r.duplicateGroups).toHaveLength(1);
    expect(r.duplicateGroups[0].sheetRows).toEqual([2, 3]);
  });

  it("lists empty columns so template noise is visible", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "Jaws", "Movie Release Year": "1975", Format: "BLU-RAY", Barcode: "025192275708" }),
    ]);
    expect(r.emptyColumns).toContain("Case Type");
    expect(r.emptyColumns).not.toContain("Title");
  });

  it("ignores fully blank rows rather than reporting them", () => {
    const r = preflightImport(HEADERS, [
      row({ Title: "Jaws", "Movie Release Year": "1975", Format: "BLU-RAY", Barcode: "025192275708" }),
      HEADERS.map(() => ""),
    ]);
    expect(r.totalRows).toBe(1);
  });

  it("produces a readable text report", () => {
    const r = preflightImport(HEADERS, [row({ Title: "", Format: "BLU-RAY" })]);
    const txt = formatPreflightReport(r);
    expect(txt).toContain("cannot");
    expect(txt).toContain("Row 2");
  });
});
