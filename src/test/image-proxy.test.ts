import { describe, it, expect } from "vitest";
import { isProxiableImageUrl, toProxiedImageUrl } from "@/lib/image-proxy";

describe("toProxiedImageUrl", () => {
  describe("upstream rewriting", () => {
    it("rewrites TMDB poster URLs", () => {
      expect(toProxiedImageUrl("https://image.tmdb.org/t/p/w500/abc.jpg")).toBe("/img/tmdb/w500/abc.jpg");
    });

    it("rewrites TMDB original-size URLs", () => {
      expect(toProxiedImageUrl("https://image.tmdb.org/t/p/original/foo.jpg")).toBe(
        "/img/tmdb/original/foo.jpg",
      );
    });

    it("rewrites Discogs primary CDN URLs", () => {
      expect(toProxiedImageUrl("https://i.discogs.com/some/path/image.jpg")).toBe(
        "/img/discogs/some/path/image.jpg",
      );
    });

    it("rewrites Discogs alternate CDN URLs", () => {
      expect(toProxiedImageUrl("https://img.discogs.com/anotherpath.jpg")).toBe(
        "/img/discogs-img/anotherpath.jpg",
      );
    });

    it("rewrites Cover Art Archive URLs", () => {
      expect(toProxiedImageUrl("https://coverartarchive.org/release/abc/123.jpg")).toBe(
        "/img/coverart/release/abc/123.jpg",
      );
    });

    it("rewrites IGDB URLs", () => {
      expect(toProxiedImageUrl("https://images.igdb.com/igdb/image/upload/t_cover_big/cover.jpg")).toBe(
        "/img/igdb/igdb/image/upload/t_cover_big/cover.jpg",
      );
    });

    it("rewrites RAWG URLs", () => {
      expect(toProxiedImageUrl("https://media.rawg.io/media/games/abc.jpg")).toBe(
        "/img/rawg/media/games/abc.jpg",
      );
    });

    it("rewrites picsum URLs", () => {
      expect(toProxiedImageUrl("https://picsum.photos/seed/foo/300/450")).toBe("/img/picsum/seed/foo/300/450");
    });

    it("strips query strings to maximize cache hits", () => {
      expect(toProxiedImageUrl("https://image.tmdb.org/t/p/w500/abc.jpg?v=12345")).toBe(
        "/img/tmdb/w500/abc.jpg",
      );
    });
  });

  describe("passthrough", () => {
    it("returns null for empty/null/undefined", () => {
      expect(toProxiedImageUrl(null)).toBeNull();
      expect(toProxiedImageUrl(undefined)).toBeNull();
      expect(toProxiedImageUrl("")).toBeNull();
      expect(toProxiedImageUrl("   ")).toBeNull();
    });

    it("leaves already-proxied paths alone", () => {
      expect(toProxiedImageUrl("/img/tmdb/w500/abc.jpg")).toBe("/img/tmdb/w500/abc.jpg");
    });

    it("leaves arbitrary same-origin paths alone", () => {
      expect(toProxiedImageUrl("/static/logo.png")).toBe("/static/logo.png");
    });

    it("leaves data URIs alone", () => {
      const dataUri = "data:image/png;base64,iVBORw0KGgoAAAANS";
      expect(toProxiedImageUrl(dataUri)).toBe(dataUri);
    });

    it("leaves blob URIs alone", () => {
      expect(toProxiedImageUrl("blob:https://discstacked.app/abc-123")).toBe(
        "blob:https://discstacked.app/abc-123",
      );
    });

    it("leaves Supabase storage URLs alone (already self-hosted)", () => {
      const supabaseUrl = "https://uehokbnqudoabjfzcfaj.supabase.co/storage/v1/object/public/cover-art/x.jpg";
      expect(toProxiedImageUrl(supabaseUrl)).toBe(supabaseUrl);
    });

    it("leaves any other Supabase project URL alone", () => {
      const supabaseUrl = "https://abc.supabase.co/storage/v1/object/public/foo.jpg";
      expect(toProxiedImageUrl(supabaseUrl)).toBe(supabaseUrl);
    });

    it("leaves unknown upstreams alone (better to attempt direct than 400 through proxy)", () => {
      const unknownHost = "https://example.com/cover.jpg";
      expect(toProxiedImageUrl(unknownHost)).toBe(unknownHost);
    });

    it("returns input unchanged when not a parseable URL", () => {
      expect(toProxiedImageUrl("not a url")).toBe("not a url");
    });
  });
});

describe("isProxiableImageUrl", () => {
  it("is true for TMDB", () => {
    expect(isProxiableImageUrl("https://image.tmdb.org/t/p/w500/x.jpg")).toBe(true);
  });

  it("is true for Discogs", () => {
    expect(isProxiableImageUrl("https://i.discogs.com/foo.jpg")).toBe(true);
  });

  it("is false for Supabase URLs", () => {
    expect(isProxiableImageUrl("https://uehokbnqudoabjfzcfaj.supabase.co/storage/x.jpg")).toBe(false);
  });

  it("is false for unknown hosts", () => {
    expect(isProxiableImageUrl("https://random.example/cover.jpg")).toBe(false);
  });

  it("is false for null/empty", () => {
    expect(isProxiableImageUrl(null)).toBe(false);
    expect(isProxiableImageUrl("")).toBe(false);
  });
});
