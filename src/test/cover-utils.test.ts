import { describe, expect, it } from "vitest";
import { getDisplayPosterUrl, preferPosterUrl } from "@/lib/cover-utils";
import type { MediaItem } from "@/lib/types";

describe("cover-utils", () => {
  it("prefers a reliable fallback poster over a brittle package image", () => {
    expect(
      preferPosterUrl(
        "https://images-na.ssl-images-amazon.com/images/I/brittle.jpg",
        "https://image.tmdb.org/t/p/w500/stable.jpg",
      ),
    ).toBe("https://image.tmdb.org/t/p/w500/stable.jpg");
  });

  it("keeps the primary poster when it is already reliable", () => {
    expect(
      preferPosterUrl(
        "https://image.tmdb.org/t/p/w500/current.jpg",
        "https://image.tmdb.org/t/p/w500/fallback.jpg",
      ),
    ).toBe("https://image.tmdb.org/t/p/w500/current.jpg");
  });

  it("uses the edition TMDB poster for display when the stored poster is a brittle package image", () => {
    const item: MediaItem = {
      id: "1",
      title: "Edge of Tomorrow",
      mediaType: "movies",
      posterUrl: "https://images-na.ssl-images-amazon.com/images/I/brittle.jpg",
      metadata: {
        edition: {
          cover_art_url: "https://images.static-bluray.com/movies/covers/116696_front.jpg",
          tmdb_poster_url: "https://image.tmdb.org/t/p/w500/stable.jpg",
        },
      },
    };

    expect(getDisplayPosterUrl(item)).toBe("https://image.tmdb.org/t/p/w500/stable.jpg");
  });
});
