import { describe, expect, it } from "vitest";
import { prepareImportItemsOneToOne } from "@/lib/import-preview";

describe("one-to-one import preview", () => {
  it("preserves duplicate-looking and multi-film source rows as owned items", () => {
    const rows = [
      { Title: "Arrival", Format: "Blu-ray", "UPC/EAN": "111" },
      { Title: "Arrival", Format: "Blu-ray", "UPC/EAN": "222" },
      { Title: "Capote / In Cold Blood", Format: "Blu-ray", "UPC/EAN": "333" },
      { Title: "The Matrix 4-Film Collection", Format: "4K", "UPC/EAN": "444" },
    ];

    const prepared = prepareImportItemsOneToOne(rows, "movies");

    expect(prepared).toHaveLength(rows.length);
    expect(prepared.map((item) => item.title)).toEqual(rows.map((row) => row.Title));
    expect(prepared.map((item) => item.barcode)).toEqual(["111", "222", "333", "444"]);
  });
});
