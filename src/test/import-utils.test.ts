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
});
