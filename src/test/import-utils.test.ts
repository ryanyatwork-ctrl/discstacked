import { describe, expect, it } from "vitest";
import { buildImportIdentityKeys, detectFormats, mapClzRow, mergeDuplicates, parseCsv } from "@/lib/import-utils";

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

  it("builds game import identity from title, platform, and year", () => {
    const keys = buildImportIdentityKeys({
      title: "The 7th Guest",
      year: 1993,
      format: "PC",
      metadata: {
        platforms: ["PC"],
      },
    }, "games");

    expect(keys).toContain("game::the 7th guest::pc::1993");
  });

  it("builds music import identity from barcode and catalog number", () => {
    const withBarcode = buildImportIdentityKeys({
      title: "Decade of Decadence",
      year: 1991,
      barcode: "075992650925",
      metadata: {
        artist: "Motley Crue",
        catalog_number: "9 26509-2",
        label: "Elektra",
        track_count: "14",
        total_length: "1:06:00",
      },
    }, "cds");

    const withoutBarcode = buildImportIdentityKeys({
      title: "Decade of Decadence",
      year: 1991,
      format: "CD",
      metadata: {
        artist: "Motley Crue",
        catalog_number: "9 26509-2",
        label: "Elektra",
        track_count: "14",
        total_length: "1:06:00",
      },
    }, "cds");

    expect(withBarcode).toContain("barcode::075992650925");
    expect(withoutBarcode).toContain("cd-cat::9265092");
    expect(withoutBarcode.some((key) => key.startsWith("cd::motley crue::decade of decadence"))).toBe(true);
  });

  it("maps CLZ music collector fields into metadata", () => {
    const mapped = mapClzRow({
      Artist: "Motley Crue",
      Title: "Motley Crue",
      "Release Year": "1994",
      Format: "CD",
      Tracks: "12",
      Length: "58:03",
      Genre: "Hard Rock",
      Label: "Elektra",
      "Cat. Number": "61745-2",
      Discs: "1",
      Subtitle: "Red logo variant",
      Country: "US",
      "UPC (Barcode)": "075596174520",
      Packaging: "Jewel Case",
      "Package/Sleeve Condition": "Good",
      "Cover Front": "https://example.com/front.jpg",
      "Clz AlbumID": "12345",
      "Clz DiscID": "67890",
    }, "cds");

    expect(mapped).toMatchObject({
      title: "Motley Crue",
      year: 1994,
      format: "CD",
      barcode: "075596174520",
      poster_url: "https://example.com/front.jpg",
      metadata: expect.objectContaining({
        artist: "Motley Crue",
        label: "Elektra",
        catalog_number: "61745-2",
        disc_count: "1",
        subtitle: "Red logo variant",
        country: "US",
        packaging: "Jewel Case",
        package_condition: "Good",
        clz_album_id: "12345",
        clz_disc_id: "67890",
      }),
    });
  });

  it("extracts OBI and sleeved collector details from CLZ music text", () => {
    const mapped = mapClzRow({
      Artist: "Sonata Arctica",
      Title: "Reckoning Night",
      Format: "CD",
      Notes: "Includes OBI Strip. Sleeved - removed from jewel case.",
    }, "cds");

    expect(mapped.metadata).toMatchObject({
      artist: "Sonata Arctica",
      obi_status: "included",
      sleeved: true,
    });
  });

  it("merges duplicate CLZ game rows but keeps different platforms separate", () => {
    const rows = [
      mapClzRow({
        Title: "The 7th Guest",
        Platform: "PC",
        Genre: "Adventure; Puzzle",
        "Release Year": "1993",
        Publisher: "Virgin Interactive Entertainment",
        Developer: "Trilobyte",
      }, "games"),
      mapClzRow({
        Title: "The 7th Guest",
        Platform: "PC",
        Genre: "Adventure; Puzzle",
        "Release Year": "1993",
        Publisher: "Virgin Interactive Entertainment",
        Developer: "Trilobyte",
      }, "games"),
      mapClzRow({
        Title: "The 7th Guest",
        Platform: "PlayStation 1",
        Genre: "Adventure",
        "Release Year": "1995",
        Publisher: "Virgin Interactive Entertainment",
        Developer: "Trilobyte",
      }, "games"),
    ];

    const merged = mergeDuplicates(rows, "games");

    expect(merged).toHaveLength(2);
    expect(merged.find((item) => item.format === "PC")).toBeTruthy();
    expect(merged.find((item) => item.format === "PlayStation 1")).toBeTruthy();
  });
});
