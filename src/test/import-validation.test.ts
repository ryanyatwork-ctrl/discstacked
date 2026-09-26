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

  it("reports missing source titles as blockers and missing prepared barcodes as warnings", () => {
    const result = checkImportList(
      [
        { sourceRow: 2, title: "Arrival", barcode: "123" },
        { sourceRow: 3, title: "", barcode: "456" },
      ],
      [
        { title: "Arrival", barcode: "123", formats: ["Blu-ray"] },
        { title: "Blade Runner", formats: ["4K"] },
      ],
    );

    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].location).toBe("Source row 3");
    expect(result.warnings).toHaveLength(1);
    expect(result.missingBarcodeCount).toBe(1);
  });

  it("exports every blocker and warning in the downloadable CSV", () => {
    const result = checkImportList(
      [{ sourceRow: 2, title: "", barcode: "456" }],
      [{ title: "A, quoted \"title\"" }],
    );
    const csv = importCheckToCsv(result);

    expect(csv).toContain('"blocker","Source row 2"');
    expect(csv).toContain('"warning","Prepared item 1","A, quoted ""title"""');
  });
});
