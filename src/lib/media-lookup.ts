import { supabase } from "@/integrations/supabase/client";
import { MediaTab } from "@/lib/types";
import { lookupEditionCatalogByBarcode } from "@/lib/edition-catalog";
import { preferPosterUrl } from "@/lib/cover-utils";

export interface MediaLookupResult {
  id: string;
  title: string;
  year: number | null;
  cover_url: string | null;
  genre: string | null;
  // Movies
  tmdb_id?: number | null;
  runtime?: number | null;
  tagline?: string | null;
  overview?: string | null;
  cast?: any[];
  crew?: any;
  // Books
  author?: string | null;
  page_count?: number | null;
  publisher?: string | null;
  isbn?: string | null;
  description?: string | null;
  categories?: string[];
  // Music
  artist?: string | null;
  label?: string | null;
  catalog_number?: string | null;
  country?: string | null;
  tracklist?: { position: string; title: string; duration?: string }[];
  // Games
  platforms?: string[];
  developer?: string | null;
  publisher?: string | null;
  description?: string | null;
  rating?: number | null;
  // Common
  barcode?: string | null;
  source?: string;
  detected_formats?: string[];
  // Content type
  media_type?: string; // movie | tv | tv_season | box_set
  // TV Season
  tmdb_series_id?: number | null;
  season_number?: number | null;
  series_title?: string | null;
  show_name?: string | null;
  episode_count?: number | null;
  // Box Set
  included_titles?: { title: string; year?: number | null; tmdb_id?: number | null }[];
  // Edition / Package
  edition?: {
    label?: string;
    barcode_title?: string;
    package_title?: string;
    package_year?: number | null;
    formats?: string[];
    cover_art_url?: string | null;
    tmdb_poster_url?: string | null;
    disc_count?: number | null;
    digital_code_expected?: boolean | null;
    slipcover_expected?: boolean | null;
  };
}

export interface MultiMovieResult {
  is_multi_movie: true;
  product_title: string;
  barcode_title: string;
  detected_formats: string[];
  cover_art_url?: string | null;
  disc_count?: number | null;
  edition_label?: string | null;
  digital_code_expected?: boolean | null;
  slipcover_expected?: boolean | null;
  collection_name?: string;
  movies: {
    tmdb_id: number | null;
    title: string;
    year: number | null;
    poster_url: string | null;
    genre?: string | null;
    rating?: number | null;
    overview?: string | null;
    runtime?: number | null;
    tagline?: string | null;
    cast?: any[];
    crew?: any;
  }[];
}

export interface MultiSeasonResult {
  is_multi_season: true;
  product_title: string;
  barcode_title: string;
  detected_formats: string[];
  cover_art_url?: string | null;
  disc_count?: number | null;
  edition_label?: string | null;
  digital_code_expected?: boolean | null;
  slipcover_expected?: boolean | null;
  show_name: string;
  tmdb_series_id: number;
  seasons: {
    tmdb_series_id: number;
    season_number: number;
    title: string;
    year: number | null;
    poster_url: string | null;
    overview?: string | null;
    episode_count?: number | null;
  }[];
}

export type BarcodeLookupResult = {
  direct?: MediaLookupResult;
  results?: MediaLookupResult[];
  multiMovie?: MultiMovieResult;
  multiSeason?: MultiSeasonResult;
  partialTitle?: string;
  partialFormats?: string[];
};

function normalizeLooseTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isHighConfidenceFallbackResult(
  query: string,
  result: Pick<MediaLookupResult, "title" | "year">,
  expectedYear?: number | null,
) {
  const normalizedQuery = normalizeLooseTitle(query);
  const normalizedTitle = normalizeLooseTitle(result.title || "");
  if (!normalizedQuery || !normalizedTitle) return false;
  if (normalizedQuery !== normalizedTitle) return false;

  const wordCount = normalizedQuery.split(" ").filter(Boolean).length;
  if (wordCount <= 1) return false;

  if (expectedYear && result.year && Math.abs(expectedYear - result.year) > 1) {
    return false;
  }

  return true;
}

export async function searchMedia(
  activeTab: MediaTab,
  query: string,
  opts?: { year?: number; barcode?: string; searchType?: "movie" | "tv"; artist?: string; catalogNumber?: string; platform?: string }
): Promise<MediaLookupResult[]> {
  if (activeTab === "movies" || activeTab === "music-films") return searchTmdb(activeTab === "music-films" && opts?.artist ? `${opts.artist} ${query}` : query, opts);
  if (activeTab === "cds") return searchMusic(query, { barcode: opts?.barcode, artist: opts?.artist, catalogNumber: opts?.catalogNumber });
  if (activeTab === "games") return searchGames(query, { platform: opts?.platform });
  return [];
}

export async function lookupBarcode(
  activeTab: MediaTab,
  barcode: string
): Promise<BarcodeLookupResult> {
  if (activeTab === "movies" || activeTab === "music-films") {
    const localCatalogResult = await lookupBarcodeFromEditionCatalog(barcode, activeTab);
    if (localCatalogResult) return localCatalogResult;

    const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
      body: { barcode },
    });
    if (error) throw new Error(error.message);

    // Multi-movie detection
    if (data?.is_multi_movie && data?.multi_movies?.length > 0) {
      return {
        multiMovie: {
          is_multi_movie: true,
          product_title: data.product_title,
          barcode_title: data.barcode_title,
          detected_formats: data.detected_formats || [],
          cover_art_url: data.package_image_url || null,
          disc_count: data.disc_count || null,
          edition_label: data.edition_label || null,
          digital_code_expected: data.digital_code_expected ?? null,
          slipcover_expected: data.slipcover_expected ?? null,
          collection_name: data.collection_name,
          movies: data.multi_movies,
        },
      };
    }

    // Multi-season TV box set detection
    if (data?.is_multi_season && data?.seasons?.length > 0) {
      return {
        multiSeason: {
          is_multi_season: true,
          product_title: data.product_title,
          barcode_title: data.barcode_title,
          detected_formats: data.detected_formats || [],
          cover_art_url: data.package_image_url || null,
          disc_count: data.disc_count || null,
          edition_label: data.edition_label || null,
          digital_code_expected: data.digital_code_expected ?? null,
          slipcover_expected: data.slipcover_expected ?? null,
          show_name: data.show_name,
          tmdb_series_id: data.tmdb_series_id,
          seasons: data.seasons,
        },
      };
    }

    const hasStrongTmdbMatch = Boolean(
      data?.tmdb_id ||
      (data?.tmdb_series_id && data?.season_number) ||
      (data?.media_type && data.media_type !== "box_set"),
    );

    if (data?.title && hasStrongTmdbMatch) {
      return {
        direct: {
          id: String(data.tmdb_id || barcode),
          tmdb_id: data.tmdb_id || null,
          title: data.title,
          year: data.year || null,
          cover_url: preferPosterUrl(data.package_image_url || null, data.tmdb_poster_url || data.poster_url || null),
          genre: data.genre || null,
          runtime: data.runtime,
          tagline: data.tagline,
          overview: data.overview,
          cast: data.cast,
          crew: data.crew,
          detected_formats: data.detected_formats,
          media_type: data.media_type || "movie",
          tmdb_series_id: data.tmdb_series_id || null,
          season_number: data.season_number || null,
          series_title: data.series_title || data.show_name || null,
          show_name: data.show_name || data.series_title || null,
          episode_count: data.episode_count || null,
          included_titles: data.included_titles || undefined,
          edition: data.barcode_title ? {
            barcode_title: data.barcode_title,
            package_title: data.product_title || data.barcode_title,
            formats: data.detected_formats || [],
            label: data.edition_label || undefined,
            cover_art_url: data.package_image_url || null,
            tmdb_poster_url: data.tmdb_poster_url || data.poster_url || null,
            disc_count: data.disc_count || null,
            digital_code_expected: data.digital_code_expected ?? null,
            slipcover_expected: data.slipcover_expected ?? null,
          } : undefined,
        },
      };
    }
    if (data?.results?.length > 0) {
      return { results: data.results.map(mapTmdbResult) };
    }
    // Barcode not found or partial match — return partial data for soft-fail UX
    if (data?.barcode_not_found || (data?.title && !data?.tmdb_id)) {
      return {
        partialTitle: data.product_title || data.barcode_title || data.title || "",
        partialFormats: data.detected_formats || [],
      };
    }
    return {};
  }

  if (activeTab === "cds") {
    const localCatalogResult = await lookupBarcodeFromEditionCatalog(barcode, activeTab);
    if (localCatalogResult) return localCatalogResult;

    const { data, error } = await supabase.functions.invoke("music-lookup", {
      body: { barcode },
    });
    if (error) throw new Error(error.message);
    if (data?.title) {
      return {
        direct: {
          id: data.barcode || barcode,
          title: data.title,
          year: data.year || null,
          cover_url: data.poster_url || null,
          genre: data.genre || null,
          artist: data.artist,
          label: data.label,
          catalog_number: data.catalog_number || null,
          country: data.country || null,
          tracklist: data.tracklist,
          barcode: data.barcode,
          detected_formats: data.detected_formats || [],
        },
      };
    }
    if (data?.results?.length > 0) {
      return { results: data.results };
    }
    return {};
  }

  if (activeTab === "games") {
    const localCatalogResult = await lookupBarcodeFromEditionCatalog(barcode, activeTab);
    if (localCatalogResult) return localCatalogResult;
    return {};
  }

  return {};
}

// --- Internal search helpers ---

async function lookupBarcodeFromEditionCatalog(barcode: string, activeTab: MediaTab): Promise<BarcodeLookupResult | null> {
  const catalogEntry = await lookupEditionCatalogByBarcode(barcode);
  if (!catalogEntry) return null;

  const catalogMetadata = (catalogEntry.metadata || {}) as Record<string, any>;
  if (catalogMetadata.is_multi_movie && Array.isArray(catalogMetadata.included_titles)) {
    return {
      multiMovie: {
        is_multi_movie: true,
        product_title: catalogEntry.product_title || catalogEntry.title,
        barcode_title: catalogEntry.product_title || catalogEntry.title,
        detected_formats: catalogEntry.formats || [],
        cover_art_url: catalogEntry.package_image_url || null,
        disc_count: catalogEntry.disc_count || null,
        edition_label: catalogEntry.edition || null,
        digital_code_expected: null,
        slipcover_expected: null,
        collection_name: catalogEntry.title,
        movies: catalogMetadata.included_titles.map((movie: any) => ({
          tmdb_id: movie.tmdb_id || null,
          title: movie.title,
          year: movie.year ?? null,
          poster_url: null,
          overview: null,
        })),
      },
    };
  }

  if (catalogMetadata.is_multi_season && Array.isArray(catalogMetadata.included_titles)) {
    return {
      multiSeason: {
        is_multi_season: true,
        product_title: catalogEntry.product_title || catalogEntry.title,
        barcode_title: catalogEntry.product_title || catalogEntry.title,
        detected_formats: catalogEntry.formats || [],
        cover_art_url: catalogEntry.package_image_url || null,
        disc_count: catalogEntry.disc_count || null,
        edition_label: catalogEntry.edition || null,
        digital_code_expected: null,
        slipcover_expected: null,
        show_name: catalogEntry.title,
        tmdb_series_id: catalogEntry.external_id ? Number(catalogEntry.external_id) : 0,
        seasons: catalogMetadata.included_titles.map((season: any) => ({
          tmdb_series_id: catalogEntry.external_id ? Number(catalogEntry.external_id) : 0,
          season_number: season.season_number,
          title: season.title,
          year: season.year ?? null,
          poster_url: null,
          overview: null,
          episode_count: null,
        })),
      },
    };
  }

  const metadata = catalogMetadata || {};
  const baseDirect: MediaLookupResult = {
    id: catalogEntry.external_id || `catalog-${catalogEntry.barcode}`,
    title: catalogEntry.title,
    year: catalogEntry.year ?? null,
    cover_url: catalogEntry.package_image_url || null,
    genre: (metadata.genre as string) || null,
    barcode: catalogEntry.barcode,
    detected_formats: catalogEntry.formats || [],
    source: "edition_catalog",
    artist: (metadata.artist as string) || null,
    label: (metadata.label as string) || null,
    catalog_number: (metadata.catalog_number as string) || null,
    country: (metadata.country as string) || null,
    tracklist: Array.isArray(metadata.tracklist) ? metadata.tracklist : undefined,
    platforms: Array.isArray(metadata.platforms) ? metadata.platforms : undefined,
    developer: (metadata.developer as string) || null,
    publisher: (metadata.publisher as string) || null,
    description: (metadata.description as string) || (metadata.overview as string) || null,
    rating: typeof metadata.rating === "number" ? metadata.rating : null,
    edition: {
      label: catalogEntry.edition || undefined,
      barcode_title: catalogEntry.product_title || catalogEntry.title,
      package_title: catalogEntry.product_title || catalogEntry.title,
      package_year: catalogEntry.year,
      formats: catalogEntry.formats || [],
      cover_art_url: catalogEntry.package_image_url,
      tmdb_poster_url: null,
      disc_count: catalogEntry.disc_count,
    },
  };

  if (activeTab === "cds" || activeTab === "games") {
    return { direct: baseDirect };
  }

  const query = catalogEntry.title;
  const year = catalogEntry.year ?? undefined;
  let results: MediaLookupResult[] = [];
  try {
    results = await searchTmdb(query, { year });
  } catch {
    results = [];
  }

  const decorate = (result: MediaLookupResult): MediaLookupResult => ({
    ...baseDirect,
    ...result,
    detected_formats: catalogEntry.formats || result.detected_formats,
    cover_url: preferPosterUrl(catalogEntry.package_image_url || null, result.cover_url || null),
    edition: {
      ...baseDirect.edition,
      tmdb_poster_url: result.cover_url,
    },
    source: "edition_catalog",
  });

  if (results.length === 1) return { direct: decorate(results[0]) };
  if (results.length > 1) return { results: results.map(decorate) };
  return { direct: baseDirect };
}

function mapTmdbResult(r: any): MediaLookupResult {
  return {
    id: `tmdb-${r.tmdb_id}`,
    tmdb_id: r.tmdb_id,
    title: r.title,
    year: r.year || null,
    cover_url: r.poster_url || null,
    genre: r.genre || null,
    runtime: r.runtime,
    tagline: r.tagline,
    overview: r.overview,
    cast: r.cast,
    crew: r.crew,
    source: "tmdb",
    media_type: r.media_type || "movie",
    tmdb_series_id: r.tmdb_series_id || null,
    season_number: r.season_number || null,
    series_title: r.series_title || r.show_name || null,
    show_name: r.show_name || r.series_title || null,
    episode_count: r.episode_count || null,
    included_titles: r.included_titles || undefined,
  };
}

async function searchTmdb(
  query: string,
  opts?: { year?: number; searchType?: "movie" | "tv" }
): Promise<MediaLookupResult[]> {
  const { data, error } = await supabase.functions.invoke("tmdb-lookup", {
    body: { query, year: opts?.year, search_type: opts?.searchType },
  });
  if (error) throw new Error(error.message);
  return (data.results || []).map(mapTmdbResult);
}

async function searchBooks(query: string, isbn?: string): Promise<MediaLookupResult[]> {
  const { data, error } = await supabase.functions.invoke("book-lookup", {
    body: { query, isbn },
  });
  if (error) throw new Error(error.message);
  return (data.results || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    year: r.published_date ? parseInt(r.published_date) : null,
    cover_url: r.cover_url || null,
    genre: r.categories?.join(", ") || null,
    author: r.author,
    page_count: r.page_count,
    publisher: r.publisher,
    isbn: r.isbn,
    description: r.description,
    source: r.source,
  }));
}

async function searchMusic(
  query: string,
  opts?: { barcode?: string; artist?: string; catalogNumber?: string },
): Promise<MediaLookupResult[]> {
  const { data, error } = await supabase.functions.invoke("music-lookup", {
    body: {
      query,
      barcode: opts?.barcode,
      artist: opts?.artist,
      catalogNumber: opts?.catalogNumber,
    },
  });
  if (error) throw new Error(error.message);
  return (data.results || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    year: r.year || null,
    cover_url: r.cover_url || null,
    genre: r.genre || null,
    artist: r.artist,
    label: r.label,
    catalog_number: r.catalog_number || null,
    country: r.country || null,
    tracklist: r.tracklist,
    barcode: r.barcode,
    detected_formats: r.detected_formats || [],
    source: r.source,
  }));
}

async function searchGames(query: string, opts?: { platform?: string }): Promise<MediaLookupResult[]> {
  const { data, error } = await supabase.functions.invoke("game-lookup", {
    body: { query, platform: opts?.platform },
  });
  if (error) throw new Error(error.message);
  return (data.results || []).map((r: any) => ({
    id: r.id,
    title: r.title,
    year: r.year || null,
    cover_url: r.cover_url || null,
    genre: r.genre || null,
    platforms: r.platforms,
    developer: r.developer,
    publisher: r.publisher,
    description: r.description,
    rating: r.rating,
    source: r.source,
  }));
}
