import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the supabase client so lookupBarcode can be tested without network.
const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

// Import *after* the mock is declared so the module picks it up.
import { lookupBarcode } from "@/lib/media-lookup";

beforeEach(() => {
  invoke.mockReset();
});

describe("lookupBarcode — TV metadata propagation (P1-A)", () => {
  it("carries episode_count on a tv_season direct result", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        tmdb_id: 1399,
        tmdb_series_id: 1399,
        season_number: 1,
        episode_count: 10,
        title: "Game of Thrones - Season 1",
        year: 2011,
        poster_url: "https://example.com/poster.jpg",
        media_type: "tv_season",
        detected_formats: ["Blu-ray"],
      },
      error: null,
    });

    const result = await lookupBarcode("movies", "0883929145157");
    expect(result.direct).toBeDefined();
    expect(result.direct?.tmdb_id).toBe(1399);
    expect(result.direct?.tmdb_series_id).toBe(1399);
    expect(result.direct?.season_number).toBe(1);
    expect(result.direct?.episode_count).toBe(10);
    expect(result.direct?.media_type).toBe("tv_season");
  });

  it("carries episode_count on a non-season TV direct result", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        tmdb_id: 1668,
        tmdb_series_id: 1668,
        episode_count: 236,
        title: "Friends",
        year: 1994,
        poster_url: null,
        media_type: "tv",
        detected_formats: [],
      },
      error: null,
    });

    const result = await lookupBarcode("movies", "0883929123456");
    expect(result.direct?.media_type).toBe("tv");
    expect(result.direct?.episode_count).toBe(236);
    expect(result.direct?.tmdb_series_id).toBe(1668);
    expect(result.direct?.season_number).toBeNull();
  });

  it("leaves TV fields null for a plain movie result", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        tmdb_id: 27205,
        title: "Inception",
        year: 2010,
        poster_url: null,
        media_type: "movie",
        detected_formats: ["4K", "Blu-ray"],
      },
      error: null,
    });

    const result = await lookupBarcode("movies", "0883929000001");
    expect(result.direct?.media_type).toBe("movie");
    expect(result.direct?.tmdb_series_id).toBeNull();
    expect(result.direct?.season_number).toBeNull();
    expect(result.direct?.episode_count).toBeNull();
  });

  it("preserves multi-movie results without loss", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        is_multi_movie: true,
        product_title: "The Matrix Trilogy",
        barcode_title: "Matrix Trilogy 4K",
        collection_name: "The Matrix Collection",
        detected_formats: ["4K", "Blu-ray"],
        multi_movies: [
          { tmdb_id: 603, title: "The Matrix", year: 1999, poster_url: null },
          { tmdb_id: 604, title: "The Matrix Reloaded", year: 2003, poster_url: null },
          { tmdb_id: 605, title: "The Matrix Revolutions", year: 2003, poster_url: null },
        ],
      },
      error: null,
    });

    const result = await lookupBarcode("movies", "0085391163299");
    expect(result.multiMovie).toBeDefined();
    expect(result.multiMovie?.movies).toHaveLength(3);
    expect(result.multiMovie?.collection_name).toBe("The Matrix Collection");
    expect(result.multiMovie?.detected_formats).toEqual(["4K", "Blu-ray"]);
  });

  it("mapTmdbResult path preserves episode_count in search results", async () => {
    invoke.mockResolvedValueOnce({
      data: {
        results: [
          {
            tmdb_id: 1399,
            tmdb_series_id: 1399,
            season_number: 2,
            episode_count: 10,
            title: "Game of Thrones: Season 2",
            year: 2012,
            poster_url: null,
            media_type: "tv_season",
          },
        ],
      },
      error: null,
    });

    const result = await lookupBarcode("movies", "search-mode-barcode");
    expect(result.results).toHaveLength(1);
    expect(result.results?.[0].episode_count).toBe(10);
    expect(result.results?.[0].tmdb_series_id).toBe(1399);
    expect(result.results?.[0].season_number).toBe(2);
  });
});
