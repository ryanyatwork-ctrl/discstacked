import { describe, expect, it } from "vitest";
import { detectFormats, mapClzRow, parseCsv } from "@/lib/import-utils";

describe("import-utils", () => {
  it("detects collector formats from Blu-ray.com style strings", () => {
    expect(detectFormats("Blu-ray 3D + Blu-ray + DVD + Digital Copy")).toEqual([
      "Blu-ray",
      "3D",
      "DVD",
      "Digital",
    ]);
  });

  it("parses tab-delimited text exports", () => {
    const rows = parseCsv([
      "Title\tFormat\tUPC/EAN\tReleased",
      "Spider-Man: Across the Spider-Verse\tBlu-ray + DVD + Digital HD\t043396581593\t2023",
    ].join("\n"));

    expect(rows).toEqual([
      {
        Title: "Spider-Man: Across the Spider-Verse",
        Format: "Blu-ray + DVD + Digital HD",
        "UPC/EAN": "043396581593",
        Released: "2023",
      },
    ]);
  });

  it("maps Blu-ray.com style headers into collector metadata", () => {
    const mapped = mapClzRow({
      Release: "Men in Black 3",
      Media: "Blu-ray 3D + Blu-ray + DVD",
      "UPC/EAN": "043396402874",
      Discs: "3",
      Version: "Blu-ray 3D",
      Country: "United States",
      Studio: "Sony Pictures",
      Released: "2012",
    }, "movies");

    expect(mapped).toMatchObject({
      title: "Men in Black 3",
      year: 2012,
      format: "Blu-ray",
      _rowFormats: ["Blu-ray", "3D", "DVD"],
      metadata: expect.objectContaining({
        barcode: "043396402874",
        disc_count: "3",
        edition: "Blu-ray 3D",
        country: "United States",
        studio: "Sony Pictures",
      }),
    });
  });
});
