import type { MediaLookupResult } from "@/lib/media-lookup";

type MetadataShape = Record<string, any> | undefined | null;

export function getLookupExternalId(input: {
  tmdb_id?: number | null;
  media_type?: string | null;
  tmdb_series_id?: number | null;
  season_number?: number | null;
}) {
  if (input.media_type === "tv_season" && input.tmdb_series_id && input.season_number) {
    return `${input.tmdb_series_id}:${input.season_number}`;
  }

  return input.tmdb_id ? String(input.tmdb_id) : null;
}

export function buildLookupMetadata(result: Partial<MediaLookupResult>): Record<string, any> {
  const metadata: Record<string, any> = {};

  if (result.runtime != null) metadata.runtime = result.runtime;
  if (result.tagline) metadata.tagline = result.tagline;
  if (result.overview || result.description) metadata.overview = result.overview || result.description;
  if (result.cast) metadata.cast = result.cast;
  if (result.crew) metadata.crew = result.crew;
  if (result.page_count != null) metadata.page_count = result.page_count;
  if (result.publisher) metadata.publisher = result.publisher;
  if (result.isbn) metadata.isbn = result.isbn;
  if (result.label) metadata.label = result.label;
  if (result.tracklist?.length) metadata.tracklist = result.tracklist;
  if (result.platforms?.length) metadata.platforms = result.platforms;
  if (result.developer) metadata.developer = result.developer;
  if (result.source) metadata.source = result.source;
  if (result.tmdb_id) metadata.tmdb_id = result.tmdb_id;
  if (result.media_type) metadata.content_type = result.media_type;
  if (result.tmdb_series_id) metadata.tmdb_series_id = result.tmdb_series_id;
  if (result.season_number) metadata.season_number = result.season_number;
  if (result.series_title) metadata.series_title = result.series_title;
  if (result.show_name) metadata.show_name = result.show_name;
  if (result.episode_count != null) metadata.episode_count = result.episode_count;
  if (result.included_titles?.length) metadata.included_titles = result.included_titles;
  if (result.edition) metadata.edition = result.edition;

  return metadata;
}

export function buildCollectionSearchText(item: { title: string; metadata?: MetadataShape }) {
  const metadata = item.metadata ?? {};
  const includedTitles = Array.isArray(metadata.included_titles)
    ? metadata.included_titles
        .map((entry: any) => (typeof entry === "string" ? entry : entry?.title))
        .filter(Boolean)
        .join(" ")
    : "";
  const edition = metadata.edition ?? {};

  return [
    item.title,
    metadata.series_title,
    metadata.show_name,
    edition.barcode_title,
    edition.package_title,
    includedTitles,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
