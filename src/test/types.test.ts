import { describe, it, expect } from "vitest";
import { deriveContentType } from "@/lib/types";

describe("deriveContentType", () => {
  describe("lookup-driven (TMDB tagged the result)", () => {
    it("returns 'tv_season' when lookup media_type is tv_season", () => {
      expect(deriveContentType("tv_season", "movies")).toBe("tv_season");
    });

    it("returns 'tv' when lookup media_type is tv", () => {
      expect(deriveContentType("tv", "movies")).toBe("tv");
    });

    it("returns 'movie' when lookup media_type is movie", () => {
      expect(deriveContentType("movie", "movies")).toBe("movie");
    });

    it("lookup media_type wins over tab even for unusual combinations", () => {
      // Scanning a TV season barcode while in the Music Films tab should
      // still recognize it as TV — the lookup is more authoritative than
      // the user's tab choice.
      expect(deriveContentType("tv_season", "music-films")).toBe("tv_season");
    });
  });

  describe("tab fallback (lookup didn't tag)", () => {
    it("maps 'cds' tab to 'album' when lookup is null", () => {
      expect(deriveContentType(null, "cds")).toBe("album");
      expect(deriveContentType(undefined, "cds")).toBe("album");
    });

    it("maps 'games' tab to 'game'", () => {
      expect(deriveContentType(null, "games")).toBe("game");
    });

    it("maps 'music-films' tab to 'music_film' when lookup is null", () => {
      expect(deriveContentType(null, "music-films")).toBe("music_film");
    });

    it("defaults 'movies' tab to 'movie'", () => {
      expect(deriveContentType(null, "movies")).toBe("movie");
    });
  });

  describe("unrecognized lookup media_type falls back to tab", () => {
    it("unknown string falls through to tab fallback", () => {
      // e.g. edge function returning "box_set" on the direct branch —
      // not a valid content_type for media_items, tab fallback takes over.
      expect(deriveContentType("box_set", "movies")).toBe("movie");
      expect(deriveContentType("something-weird", "cds")).toBe("album");
    });
  });
});
