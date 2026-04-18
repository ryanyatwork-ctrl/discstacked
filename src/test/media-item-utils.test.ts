import { describe, expect, it } from "vitest";
import {
  buildCollectionSearchText,
  buildLookupMetadata,
  getLookupExternalId,
} from "@/lib/media-item-utils";

describe("media-item-utils", () => {
  it("builds composite external ids for TV seasons", () => {
    expect(
      getLookupExternalId({
        media_type: "tv_season",
        tmdb_series_id: 1396,
        season_number: 1,
      }),
    ).toBe("1396:1");
  });

  it("preserves collection-search aliases from metadata", () => {
    expect(
      buildCollectionSearchText({
        title: "The Lord of the Rings Collection",
        metadata: {
          edition: { package_title: "Motion Picture Trilogy" },
          included_titles: [{ title: "The Fellowship of the Ring" }],
        },
      }),
    ).toContain("motion picture trilogy");
  });

  it("maps lookup metadata needed for accurate collection rendering", () => {
    expect(
      buildLookupMetadata({
        media_type: "tv_season",
        tmdb_id: 1396,
        tmdb_series_id: 1396,
        season_number: 2,
        series_title: "Breaking Bad",
        episode_count: 13,
        edition: { package_title: "The Complete Series", formats: ["Blu-ray"] },
      }),
    ).toMatchObject({
      tmdb_id: 1396,
      content_type: "tv_season",
      tmdb_series_id: 1396,
      season_number: 2,
      series_title: "Breaking Bad",
      episode_count: 13,
      edition: { package_title: "The Complete Series", formats: ["Blu-ray"] },
    });
  });
});
