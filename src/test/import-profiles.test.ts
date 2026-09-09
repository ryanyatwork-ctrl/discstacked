import { describe, it, expect } from "vitest";
import {
  detectImportSource,
  resolveImportProfile,
  describeDetection,
  IMPORT_PROFILES,
} from "@/lib/import-profiles";

// Header row from a real Blu-ray.com collection export.
const BLURAY_HEADERS = [
  "Title", "Movie Release Year", "Blu-Ray Release Year", "Format", "Barcode",
  "Edition", "Disc Count", "Case Type", "Slipcover", "Digital Code Status",
  "Digital Platform", "Missing Discs / Notes", "Studio / Distributor",
  "Region", "Rating", "Genre", "Watched", "Purchase Price",
  "Purchase Location", "Date Added",
];

const CLZ_HEADERS = [
  "Title", "Index Title", "Sort Title", "Release Year", "Format", "Barcode",
  "No. of Discs/Tapes", "Cat. Number", "Cover Front", "Cover Back",
  "User Tags", "Price Comment", "CLZ AlbumID", "IMDb ID", "TMDB ID",
];

const RANDOM_HEADERS = ["Name", "Thing", "Notes", "Qty", "Colour"];

describe("source detection", () => {
  it("identifies a Blu-ray.com export", () => {
    const d = detectImportSource(BLURAY_HEADERS);
    expect(d[0].id).toBe("bluray-com");
    expect(d[0].confidence).toBe(1); // every signature column present
    expect(d[0].missing).toHaveLength(0);
  });

  it("identifies a CLZ export", () => {
    const d = detectImportSource(CLZ_HEADERS);
    expect(d[0].id).toBe("clz");
    expect(d[0].confidence).toBeGreaterThan(0.5);
    expect(d[0].matched).toContain("CLZ AlbumID");
  });

  it("does not confuse the two", () => {
    const bluray = detectImportSource(BLURAY_HEADERS);
    const clz = detectImportSource(CLZ_HEADERS);
    expect(bluray.find((x) => x.id === "clz")!.confidence).toBeLessThan(0.5);
    expect(clz.find((x) => x.id === "bluray-com")!.confidence).toBeLessThan(0.5);
  });

  it("falls back to generic for an unrecognised sheet", () => {
    const { profile, auto } = resolveImportProfile(RANDOM_HEADERS);
    expect(profile.id).toBe("generic");
    expect(auto).toBe(true);
    expect(describeDetection(detectImportSource(RANDOM_HEADERS)))
      .toContain("generic spreadsheet");
  });

  it("a user override always beats detection", () => {
    const { profile, auto } = resolveImportProfile(BLURAY_HEADERS, "clz");
    expect(profile.id).toBe("clz");
    expect(auto).toBe(false);
  });

  it("always ranks generic last as a floor", () => {
    const d = detectImportSource(BLURAY_HEADERS);
    expect(d[d.length - 1].id).toBe("generic");
  });
});

describe("quirks encode what we actually measured", () => {
  it("Blu-ray.com is marked verified and expects zero-stripped barcodes", () => {
    const q = IMPORT_PROFILES["bluray-com"].quirks;
    expect(q.confidence).toBe("verified");
    expect(q.barcodeLosesLeadingZeros).toBe(true);
    expect(q.yearFallbackColumn).toBe("Blu-Ray Release Year");
    expect(q.dateStyle).toBe("Month D YYYY");
  });

  it("unverified profiles are marked defensive, never verified", () => {
    for (const id of ["clz", "discstacked", "generic"] as const) {
      expect(IMPORT_PROFILES[id].quirks.confidence).toBe("defensive");
    }
  });

  it("every profile assumes barcode damage unless it owns the format", () => {
    expect(IMPORT_PROFILES.generic.quirks.barcodeLosesLeadingZeros).toBe(true);
    expect(IMPORT_PROFILES.discstacked.quirks.barcodeLosesLeadingZeros).toBe(false);
  });
});
