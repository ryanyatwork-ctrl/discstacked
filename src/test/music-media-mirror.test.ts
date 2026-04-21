import { describe, expect, it } from "vitest";
import { buildMusicMediaMirrorRow, deriveMusicMediaFormats, hasMusicVideoComponent } from "@/lib/music-media-mirror";

describe("music-media-mirror", () => {
  it("detects video-bearing music releases", () => {
    expect(hasMusicVideoComponent(["CD", "DVD"])).toBe(true);
    expect(hasMusicVideoComponent(["CD", "DualDisc"])).toBe(true);
    expect(hasMusicVideoComponent(["CD", "Enhanced CD"])).toBe(false);
  });

  it("derives mirror formats for dualdisc releases", () => {
    expect(deriveMusicMediaFormats(["CD", "DualDisc"])).toEqual(["DVD", "DualDisc"]);
    expect(deriveMusicMediaFormats(["CD", "Blu-ray", "DVD"])).toEqual(["Blu-ray", "DVD"]);
  });

  it("builds a music media mirror row from a mixed-format CD release", () => {
    const mirror = buildMusicMediaMirrorRow("user-1", {
      sourceItemId: "cd-item-1",
      title: "Snakes & Arrows",
      year: 2007,
      barcode: "602517362278",
      genre: "Rock",
      notes: "CD + DVD edition",
      poster_url: "https://example.com/cover.jpg",
      formats: ["CD", "DVD"],
      metadata: {
        artist: "Rush",
        catalog_number: "1736227",
        country: "Germany",
      },
    });

    expect(mirror).toMatchObject({
      media_type: "music-films",
      title: "Snakes & Arrows",
      format: "DVD",
      formats: ["DVD"],
      metadata: expect.objectContaining({
        artist: "Rush",
        catalog_number: "1736227",
        mirror_source_type: "cds",
        mirror_source_item_id: "cd-item-1",
      }),
    });
  });
});
