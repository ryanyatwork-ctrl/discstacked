import { describe, expect, it } from "vitest";
import { buildImportIdentityKeys, detectFormats, detectTvFromTitle, expandBoxSets, mapClzRow, mergeDuplicates, parseCsv } from "@/lib/import-utils";

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

  it("detects mixed-format collector music releases", () => {
    expect(detectFormats("CD + DVD Deluxe Edition")).toEqual(["DVD", "CD"]);
    expect(detectFormats("Enhanced CD")).toEqual(["CD", "Enhanced CD"]);
    expect(detectFormats("DualDisc")).toEqual(["CD", "DVD", "DualDisc"]);
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

  it("promotes a TMDb id column to external_id for exact identity", () => {
    const row = mapClzRow({
      Title: "The Last Jedi",
      Year: "2017",
      Format: "Blu-ray",
      Barcode: "786936856972",
      "TMDb ID": "181808",
      "IMDb ID": "tt2527336",
    }, "movies");

    expect(row.external_id).toBe("181808");
    expect(row.metadata.tmdb_id).toBe("181808");
    expect(row.metadata.imdb_id).toBe("tt2527336");
  });

  it("extracts the trailing numeric id from a themoviedb URL", () => {
    const row = mapClzRow({
      Title: "Dune: Part Two",
      "TMDb URL": "http://themoviedb.org/movie/693134",
    }, "movies");

    expect(row.external_id).toBe("693134");
  });

  it("pulls the ttNNNN id out of a full IMDb URL and leaves external_id unset without a TMDb id", () => {
    const row = mapClzRow({
      Title: "Face/Off",
      "IMDb URL": "https://www.imdb.com/title/tt0119094/",
    }, "movies");

    expect(row.external_id).toBeUndefined();
    expect(row.metadata.imdb_id).toBe("tt0119094");
  });

  describe("TV detection", () => {
    it("detects single seasons from the title", () => {
      expect(detectTvFromTitle("24: Season 1")).toMatchObject({ mediaType: "tv-season", contentType: "tv_season", showName: "24", seasonNumber: 1 });
      expect(detectTvFromTitle("The Sopranos - The Complete Fourth Season")).toMatchObject({ mediaType: "tv-season", seasonNumber: 4, showName: "The Sopranos" });
    });

    it("detects whole-series and ranges as tv", () => {
      expect(detectTvFromTitle("Friends: The Complete Series")).toMatchObject({ mediaType: "tv", contentType: "tv", showName: "Friends" });
      expect(detectTvFromTitle("The Wire: Seasons 1-3")).toMatchObject({ mediaType: "tv", showName: "The Wire" });
      expect(detectTvFromTitle("Band of Brothers Miniseries")).toMatchObject({ mediaType: "tv", showName: "Band of Brothers" });
    });

    it("detects TV from the CLZ edition field when the title is just the show name", () => {
      expect(detectTvFromTitle("Chuck", "The Complete Season 2")).toMatchObject({ mediaType: "tv-season", seasonNumber: 2, showName: "Chuck" });
    });

    it("does not mistake movie titles for TV", () => {
      expect(detectTvFromTitle("Season of the Witch")).toBeNull();
      expect(detectTvFromTitle("The Final Season")).toBeNull();
      expect(detectTvFromTitle("Face/Off")).toBeNull();
      expect(detectTvFromTitle("Star Wars: Episode VIII")).toBeNull();
    });

    it("does not misfile 'Open Season' movie-franchise titles as TV", () => {
      // Bare '<words> Season <n>' with no delimiter/marker stays a movie.
      expect(detectTvFromTitle("Open Season 2")).toBeNull();
      expect(detectTvFromTitle("Open Season: Scared Silly")).toBeNull();
      expect(detectTvFromTitle("Open Season", "Special Edition")).toBeNull();
    });

    it("handles worded, ordinal, and vol/episode season forms", () => {
      expect(detectTvFromTitle("The Smurfs: Season One")).toMatchObject({ mediaType: "tv-season", seasonNumber: 1 });
      expect(detectTvFromTitle("Gomer Pyle U.S.M.C.: The Complete 3rd Season")).toMatchObject({ seasonNumber: 3 });
      expect(detectTvFromTitle("Sliders - Third Season")).toMatchObject({ seasonNumber: 3 });
      expect(detectTvFromTitle("Stargate SG-1 Season 1, Vol. 1: Episodes 1-3")).toMatchObject({ mediaType: "tv-season", seasonNumber: 1 });
    });

    it("routes a TV row to tv-season during a movie import", () => {
      const row = mapClzRow({ Title: "24: Season 1", Format: "DVD", "TMDb ID": "", Year: "2001" }, "movies");
      expect(row._mediaTypeOverride).toBe("tv-season");
      expect(row.metadata.content_type).toBe("tv_season");
      expect(row.metadata.season_number).toBe(1);
      expect(row.metadata.show_name).toBe("24");
    });

    it("keeps a plain movie on the movies tab", () => {
      const row = mapClzRow({ Title: "The Godfather", Format: "Blu-ray", Year: "1972" }, "movies");
      expect(row._mediaTypeOverride).toBeUndefined();
    });

    it("does not split a multi-disc TV season as a movie box set", () => {
      const season = mapClzRow({ Title: "Chuck: Season 2", Format: "Blu-ray", "Disc Count": "6" }, "movies");
      const expanded = expandBoxSets([season]);
      // The season survives intact — not hidden or exploded into fake movies.
      expect(expanded).toHaveLength(1);
      expect(expanded[0]._mediaTypeOverride).toBe("tv-season");
    });

    it("carries the IMDb series id into metadata for a TV season", () => {
      const row = mapClzRow({ Title: "24: Season 1", Format: "DVD", "IMDb ID": "tt0285331" }, "movies");
      expect(row._mediaTypeOverride).toBe("tv-season");
      expect(row.metadata.imdb_id).toBe("tt0285331");
      // No movie tmdb id, so no external_id yet — the refresh resolves imdb → series.
      expect(row.external_id).toBeUndefined();
    });

    it("builds a series:season external_id when a TMDb series id is provided", () => {
      const row = mapClzRow({ Title: "Bones: Season 4", Format: "Blu-ray", "TMDb Series ID": "1911" }, "movies");
      expect(row._mediaTypeOverride).toBe("tv-season");
      expect(row.metadata.tmdb_series_id).toBe("1911");
      expect(row.external_id).toBe("1911:4");
    });

    it("does not let a movie TMDb id leak onto a TV row", () => {
      // A stray TMDb ID column on a TV row must not become the series identity.
      const row = mapClzRow({ Title: "Prison Break: Season 3", "TMDb ID": "2288" }, "movies");
      expect(row._mediaTypeOverride).toBe("tv-season");
      expect(row.external_id).toBeUndefined();
    });
  });

  describe("collector movie import and packaging discs", () => {
    it("decodes HTML entities in titles and editions", () => {
      const row = mapClzRow({
        Title: "The Best of Abbott &amp; Costello - Volume 2",
        Edition: "Special Edition &amp; Bonus Disc",
        Format: "DVD",
        Notes: "Bill &amp; Ted&#39;s excellent adventure &quot;mint&quot;",
      }, "movies");

      expect(row.title).toBe("The Best of Abbott & Costello - Volume 2");
      expect(row.metadata.edition).toBe("Special Edition & Bonus Disc");
      expect(row.notes).toBe('Bill & Ted\'s excellent adventure "mint"');
    });

    it("pre-populates physical packaging discs from multi-format combos", () => {
      const row = mapClzRow({
        Title: "Spider-Man: Into the Spider-Verse",
        Format: "4K Ultra HD + Blu-ray + Digital",
        "Disc Count": "2",
      }, "movies");

      expect(row.formats).toEqual(["4K", "Blu-ray", "Digital"]);
      expect(row.metadata.discs).toEqual([
        {
          label: "Disc 1",
          format: "4K",
          condition: "Unknown",
          missing: false,
          replacementNeeded: false,
        },
        {
          label: "Disc 2",
          format: "Blu-ray",
          condition: "Unknown",
          missing: false,
          replacementNeeded: false,
        },
      ]);
    });

    it("maps extended Blu-ray.com and CLZ collector columns", () => {
      const row = mapClzRow({
        Title: "Blade Runner 2049",
        Format: "4K",
        "Case Type": "Steelbook",
        Slipcover: "Yes",
        "Aspect Ratio": "2.39:1",
        Distributor: "Warner Bros.",
        Region: "Region Free",
        Comments: "Mint copy from thrift store",
        Tags: "Sci-Fi, Cyberpunk, Denis Villeneuve",
      }, "movies");

      expect(row.notes).toBe("Mint copy from thrift store");
      expect(row.metadata).toMatchObject({
        case_type: "SteelBook",
        slipcover: "Yes",
        aspect_ratio: "2.39:1",
        distributor: "Warner Bros.",
        region: "Region Free",
        tags: ["Sci-Fi", "Cyberpunk", "Denis Villeneuve"],
      });
    });

    it("parses 19-column Blu-ray.com CSV exports with disc counts and release dates", () => {
      const csvText = [
        'Title, Studio, Country code, UPC, EAN, ASIN, Release date, Slipcover, Casing, Memorabilia, Blu-ray discs, DVD discs, Digital copy, Date added, Watched, Comment, Retailer, Price, Price comment',
        '"$5 a Day","Image Entertainment",US,014381600353,0014381600353,B002TZS5QA,August 24 2010,0,Standard Blu-ray case,0,1,0,0,August 14 2025,1,,,,',
        '"10 Cloverfield Lane","Paramount Pictures",US,032429244482,0032429244482,B01BLH8R50,June 14 2016,1,Standard Blu-ray case,0,1,1,1,August 16 2025,1,"Great condition",Best Buy,14.99,Sale',
        '"Back to the Future: 30th Anniversary Trilogy","Universal Studios",US,025192275753,0025192275753,B011Q0FSC2,October 20 2015,1,DigiBook,0,4,0,1,March 16 2026,1,,,,',
      ].join("\n");

      const parsedRows = parseCsv(csvText);
      expect(parsedRows.length).toBe(3);

      const row1 = mapClzRow(parsedRows[0], "movies");
      expect(row1.title).toBe("$5 a Day");
      expect(row1.year).toBe(2010);
      expect(row1.barcode).toBe("014381600353");
      expect(row1.formats).toEqual(["Blu-ray"]);
      expect(row1.metadata.disc_count).toBe("1");
      expect(row1.metadata.slipcover).toBe("no_slip");
      expect(row1.metadata.case_type).toBe("Standard");
      expect(row1.metadata.country).toBe("US");

      const row2 = mapClzRow(parsedRows[1], "movies");
      expect(row2.title).toBe("10 Cloverfield Lane");
      expect(row2.year).toBe(2016);
      expect(row2.barcode).toBe("032429244482");
      expect(row2.formats).toEqual(["Blu-ray", "DVD", "Digital"]);
      expect(row2.metadata.disc_count).toBe("2");
      expect(row2.metadata.slipcover).toBe("has_slip");
      expect(row2.notes).toBe("Great condition");
      expect(row2.metadata.purchase_location).toBe("Best Buy");
      expect(row2.metadata.purchase_price).toBe("14.99");

      const row3 = mapClzRow(parsedRows[2], "movies");
      expect(row3.title).toBe("Back to the Future: 30th Anniversary Trilogy");
      expect(row3.year).toBe(2015);
      expect(row3.barcode).toBe("025192275753");
      expect(row3.formats).toEqual(["Blu-ray", "Digital"]);
      expect(row3.metadata.disc_count).toBe("4");
      expect(row3.metadata.case_type).toBe("DigiBook");
    });

    it("handles movie release year vs blu-ray release year, digital redemption details, and lenient case types", () => {
      const csvText = [
        'Title,Movie Release Year,Blu-Ray Release Year,Format,Case Type,Digital Code Status,Digital Platform,Notes',
        '"Blade Runner",1982,2017,"bluray","STANDARD","Included (Unused)","Movies Anywhere","4K 35th anniversary edition"',
        '"The Matrix Trilogy",1999,2020,"4k, bluray","Box Set","Used / Redeemed","Apple TV / iTunes","All 3 films in slipcase"',
        '"Inception",2010,2010,"Blu-Ray","Steelbook","Expired","Vudu / Fandango at Home","Steelbook edition with bonus disc"',
        '"Star Wars",1977,2011,"Blu-ray","SLIPCASE","Not Included","","Original trilogy box"',
        '"Indiana Jones",1981,2021,"4K UHD","Digipack","Yes","Paramount Digital","4-movie collection"',
        '"Lethal Weapon",1987,2012,"BR","Multi Pack","Used","Other","4-film favorites"',
      ].join("\n");

      const rows = parseCsv(csvText);
      expect(rows.length).toBe(6);

      const r1 = mapClzRow(rows[0], "movies");
      expect(r1.title).toBe("Blade Runner");
      expect(r1.year).toBe(1982);
      expect(r1.metadata.package_year).toBe("2017");
      expect(r1.formats).toEqual(["Blu-ray", "Digital"]);
      expect(r1.metadata.case_type).toBe("Standard");
      expect(r1.metadata.digital_code_status).toBe("Included (Unused)");
      expect(r1.metadata.digital_code_platform).toBe("Movies Anywhere");

      const r2 = mapClzRow(rows[1], "movies");
      expect(r2.title).toBe("The Matrix Trilogy");
      expect(r2.year).toBe(1999);
      expect(r2.metadata.package_year).toBe("2020");
      expect(r2.formats).toEqual(["4K", "Blu-ray", "Digital"]);
      expect(r2.metadata.case_type).toBe("Box Set");
      expect(r2.metadata.digital_code_status).toBe("Used / Redeemed");
      expect(r2.metadata.digital_code_platform).toBe("Apple TV / iTunes");

      const r3 = mapClzRow(rows[2], "movies");
      expect(r3.title).toBe("Inception");
      expect(r3.formats).toEqual(["Blu-ray"]);
      expect(r3.metadata.case_type).toBe("SteelBook");
      expect(r3.metadata.digital_code_status).toBe("Expired");

      const r4 = mapClzRow(rows[3], "movies");
      expect(r4.metadata.case_type).toBe("Slipcase");
      expect(r4.metadata.digital_code_status).toBe("Not Included");

      const r5 = mapClzRow(rows[4], "movies");
      expect(r5.metadata.case_type).toBe("DigiPack");
      expect(r5.metadata.digital_code_status).toBe("Included (Unused)");
      expect(r5.metadata.digital_code_platform).toBe("Paramount Digital");

      const r6 = mapClzRow(rows[5], "movies");
      expect(r6.metadata.case_type).toBe("Multi Pack");
      expect(r6.metadata.digital_code_status).toBe("Used / Redeemed");
    });
  });
});
