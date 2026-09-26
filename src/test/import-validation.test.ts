import { describe, expect, it } from "vitest";
import { checkImportList, importCheckToCsv, normalizeImportRowsForInsert } from "@/lib/import-validation";

describe("import validation", () => {
  it("normalizes mixed digital-copy rows to explicit non-null booleans", () => {
    const rows = normalizeImportRowsForInsert([
      { title: "With digital", format: "Blu-ray", formats: ["Blu-ray", "Digital"], digital_copy: true },
      { title: "Without digital", format: "Blu-ray", formats: ["Blu-ray"] },
      { title: "Null from JSON", format: "DVD", digital_copy: null as never },
    ], "movies", "user-1");

    expect(rows.map((row) => row.digital_copy)).toEqual([true, false, false]);
    expect(rows.every((row) => typeof row.in_plex === "boolean")).toBe(true);
    expect(rows.every((row) => typeof row.wishlist === "boolean")).toBe(true);
    expect(rows.every((row) => typeof row.want_to_watch === "boolean")).toBe(true);
  });

  it("removes spreadsheet bookkeeping before database insertion", () => {
    const [row] = normalizeImportRowsForInsert([
      { title: "Arrival", _sourceRow: 20, _previewId: "20-arrival" } as never,
    ], "movies", "user-1");

    expect(row).not.toHaveProperty("_sourceRow");
    expect(row).not.toHaveProperty("_previewId");
  });

  it("reports missing source titles as blockers and missing prepared barcodes as warnings", () => {
    const result = checkImportList(
      [
        { sourceRow: 2, title: "Arrival", barcode: "123" },
        { sourceRow: 3, title: "", barcode: "456" },
      ],
      [
        { title: "Arrival", barcode: "123", formats: ["Blu-ray"], _sourceRow: 2 },
        { title: "", formats: ["4K"], _sourceRow: 3 },
      ],
    );

    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].location).toBe("Source row 3");
    expect(result.blockedSourceRows).toEqual([3]);
    expect(result.validItemCount).toBe(1);
    expect(result.hasUnskippableBlockers).toBe(false);
    expect(result.warnings).toHaveLength(1);
    expect(result.missingBarcodeCount).toBe(1);
  });

  it("exports every blocker and warning in the downloadable CSV", () => {
    const result = checkImportList(
      [
        { sourceRow: 2, title: "", barcode: "456" },
        { sourceRow: 3, title: "A, quoted \"title\"", barcode: "" },
      ],
      [
        { title: "", barcode: "456", _sourceRow: 2 },
        { title: "A, quoted \"title\"", _sourceRow: 3 },
      ],
    );
    const csv = importCheckToCsv(result);

    expect(csv).toContain('"blocker","2","Source row 2"');
    expect(csv).toContain('"warning","3","Source row 3","A, quoted ""title"""');
  });

  it("blocks import when source and prepared counts are not one-to-one", () => {
    const result = checkImportList(
      [
        { sourceRow: 2, title: "Arrival", barcode: "111" },
        { sourceRow: 3, title: "Dune", barcode: "222" },
      ],
      [{ title: "Arrival", barcode: "111" }],
    );

    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ location: "List totals", title: "(count mismatch)" }),
    ]));
    expect(result.hasUnskippableBlockers).toBe(true);
  });

  it("reports multiple rejected spreadsheet rows and counts all remaining rows as importable", () => {
    const result = checkImportList(
      [
        { sourceRow: 20, title: "", barcode: "111" },
        { sourceRow: 38, title: "Bad rating", barcode: "222" },
        { sourceRow: 78, title: "Valid title", barcode: "333" },
      ],
      [
        { title: "", barcode: "111", _sourceRow: 20 },
        { title: "Bad rating", barcode: "222", rating: 100, _sourceRow: 38 },
        { title: "Valid title", barcode: "333", _sourceRow: 78 },
      ],
    );

    expect(result.blockedSourceRows).toEqual([20, 38]);
    expect(result.validItemCount).toBe(1);
    expect(result.blockers.map((issue) => issue.location)).toEqual(["Source row 20", "Source row 38"]);
  });
});
