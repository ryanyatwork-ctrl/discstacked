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

  it("does not mistake Dolby Digital audio for an included digital copy", () => {
    expect(detectFormats("Dolby Digital 5.1 [English]; Dolby Digital Stereo [French]")).toEqual([]);
    expect(detectFormats("1 Disc DVD")).toEqual(["DVD"]);
    expect(detectFormats("Blu-ray + Digital Code")).toEqual(["Blu-ray", "Digital"]);
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

  it("infers default movie headers when the first row is data", () => {
    const rows = parseCsv([
      "1917,Blu-ray + DVD + Digital,191329125663,2019",
      "The American,Blu-ray,025192053733,2010",
    ].join("\n"));

    expect(rows).toEqual([
      {
        Title: "1917",
        Format: "Blu-ray + DVD + Digital",
        Barcode: "191329125663",
        Year: "2019",
      },
      {
        Title: "The American",
        Format: "Blu-ray",
        Barcode: "025192053733",
        Year: "2010",
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
