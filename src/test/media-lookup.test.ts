import { describe, it, expect } from "vitest";
import { buildFailureReason, type LookupDebugEntry } from "@/lib/media-lookup";

describe("buildFailureReason", () => {
  it("returns undefined for empty/undefined debug", () => {
    expect(buildFailureReason(undefined)).toBeUndefined();
    expect(buildFailureReason([])).toBeUndefined();
  });

  it("prefers first ERROR entry when present", () => {
    const debug: LookupDebugEntry[] = [
      { source: "UPCitemdb", status: "MISS" },
      { source: "Discogs", status: "ERROR", raw: "Network unreachable" },
      { source: "OpenLibrary", status: "MISS" },
    ];
    expect(buildFailureReason(debug)).toBe("Discogs errored: Network unreachable");
  });

  it("summarizes all sources when ALL:FAILED is the last entry", () => {
    const debug: LookupDebugEntry[] = [
      { source: "UPCitemdb", status: "MISS" },
      { source: "Discogs", status: "MISS" },
      { source: "OpenLibrary", status: "MISS" },
      { source: "TMDB-UPC", status: "MISS" },
      { source: "ALL", status: "FAILED" },
    ];
    expect(buildFailureReason(debug)).toBe(
      "No source matched (UPCitemdb:MISS, Discogs:MISS, OpenLibrary:MISS, TMDB-UPC:MISS)"
    );
  });

  it("surfaces TMDB low-confidence rejection", () => {
    const debug: LookupDebugEntry[] = [
      { source: "UPCitemdb", status: "HIT" },
      {
        source: "TMDB-fuzzy",
        status: "MISS-lowconf",
        raw: { query: "Matrix Trilogy", bestResult: "The Matrix", bestId: 603 },
      },
    ];
    expect(buildFailureReason(debug)).toBe(
      'TMDB fuzzy match rejected (low confidence). Best guess: "The Matrix"'
    );
  });

  it("returns undefined when no matchable failure pattern exists", () => {
    const debug: LookupDebugEntry[] = [
      { source: "UPCitemdb", status: "HIT" },
      { source: "TMDB-UPC", status: "HIT-movie", raw: { id: 27205, title: "Inception" } },
    ];
    expect(buildFailureReason(debug)).toBeUndefined();
  });

  it("ERROR takes priority over ALL:FAILED", () => {
    const debug: LookupDebugEntry[] = [
      { source: "UPCitemdb", status: "ERROR", raw: "rate limited" },
      { source: "Discogs", status: "MISS" },
      { source: "ALL", status: "FAILED" },
    ];
    expect(buildFailureReason(debug)).toBe("UPCitemdb errored: rate limited");
  });
});
