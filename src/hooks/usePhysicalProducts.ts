import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab } from "@/lib/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface PhysicalProduct {
  id: string;
  user_id: string;
  barcode: string | null;
  product_title: string;
  formats: string[];
  edition: string | null;
  media_type: string;
  is_multi_title: boolean;
  disc_count: number;
  purchase_date: string | null;
  purchase_price: number | null;
  purchase_location: string | null;
  notes: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface MediaCopy {
  id: string;
  media_item_id: string;
  physical_product_id: string;
  format: string | null;
  disc_label: string | null;
  created_at: string;
}

/**
 * Creates a physical product and links it to a media item via media_copies.
 * For single-title items, creates one physical_product + one media_copy.
 */
export async function createPhysicalProductForItem(
  userId: string,
  mediaItemId: string,
  opts: {
    barcode?: string | null;
    productTitle: string;
    formats: string[];
    mediaType: string;
    format?: string | null;
    edition?: string | null;
    isMultiTitle?: boolean;
    discCount?: number;
    purchaseDate?: string | null;
    purchasePrice?: number | null;
    purchaseLocation?: string | null;
    metadata?: Record<string, any>;
  }
) {
  const { data: pp, error: ppError } = await supabase
    .from("physical_products")
    .insert({
      user_id: userId,
      barcode: opts.barcode || null,
      product_title: opts.productTitle,
      formats: opts.formats,
      media_type: opts.mediaType,
      edition: opts.edition || null,
      is_multi_title: opts.isMultiTitle || false,
      disc_count: opts.discCount || 1,
      purchase_date: opts.purchaseDate || null,
      purchase_price: opts.purchasePrice || null,
      purchase_location: opts.purchaseLocation || null,
      metadata: opts.metadata || {},
    } as any)
    .select()
    .single();

  if (ppError) throw ppError;

  const { error: mcError } = await supabase
    .from("media_copies")
    .insert({
      media_item_id: mediaItemId,
      physical_product_id: pp.id,
      format: opts.format || (opts.formats.length > 0 ? opts.formats[0] : null),
    } as any);

  if (mcError) throw mcError;

  return pp;
}

/**
 * Creates a multi-movie physical product and links multiple media items to it.
 * For each movie: finds existing by external_id or creates a new media_item.
 * Returns the created physical product and all media item IDs.
 */
export async function createMultiMovieProduct(
  userId: string,
  product: {
    barcode?: string | null;
    productTitle: string;
    formats: string[];
    mediaType: string;
    discCount?: number;
    purchaseDate?: string | null;
    purchasePrice?: number | null;
    purchaseLocation?: string | null;
    metadata?: Record<string, any>;
  },
  movies: {
    tmdb_id: number | null;
    title: string;
    year: number | null;
    poster_url: string | null;
    genre?: string | null;
    overview?: string | null;
    runtime?: number | null;
    cast?: any[];
    crew?: any;
  }[]
): Promise<{ physicalProduct: any; mediaItemIds: string[] }> {
  // Create the physical product
  const { data: pp, error: ppError } = await supabase
    .from("physical_products")
    .insert({
      user_id: userId,
      barcode: product.barcode || null,
      product_title: product.productTitle,
      formats: product.formats,
      media_type: product.mediaType,
      is_multi_title: true,
      disc_count: product.discCount || movies.length,
      purchase_date: product.purchaseDate || null,
      purchase_price: product.purchasePrice || null,
      purchase_location: product.purchaseLocation || null,
      metadata: product.metadata || {},
    } as any)
    .select()
    .single();

  if (ppError) throw ppError;

  const mediaItemIds: string[] = [];

  for (const movie of movies) {
    let mediaItemId: string;

    // Check if we already have this movie by external_id (tmdb_id)
    if (movie.tmdb_id) {
      const { data: existing } = await supabase
        .from("media_items")
        .select("id")
        .eq("user_id", userId)
        .eq("external_id", String(movie.tmdb_id))
        .eq("media_type", product.mediaType)
        .limit(1);

      if (existing && existing.length > 0) {
        mediaItemId = existing[0].id;
      } else {
        // Also check by title as fallback (legacy items without external_id)
        const { data: titleMatch } = await supabase
          .from("media_items")
          .select("id")
          .eq("user_id", userId)
          .eq("media_type", product.mediaType)
          .ilike("title", movie.title)
          .limit(1);

        if (titleMatch && titleMatch.length > 0) {
          mediaItemId = titleMatch[0].id;
          // Update the external_id on the existing item
          await supabase
            .from("media_items")
            .update({ external_id: String(movie.tmdb_id) } as any)
            .eq("id", mediaItemId);
        } else {
          // Create new media item
          const metadata: Record<string, any> = {};
          if (movie.overview) metadata.overview = movie.overview;
          if (movie.runtime) metadata.runtime = movie.runtime;
          if (movie.cast) metadata.cast = movie.cast;
          if (movie.crew) metadata.crew = movie.crew;
          metadata.edition = {
            package_title: product.productTitle,
            formats: product.formats,
            ...(product.metadata?.edition || {}),
          };

          const { data: newItem, error: insertError } = await supabase
            .from("media_items")
            .insert({
              user_id: userId,
              title: movie.title,
              year: movie.year,
              poster_url: product.metadata?.edition?.cover_art_url || movie.poster_url,
              genre: movie.genre || null,
              media_type: product.mediaType,
              external_id: movie.tmdb_id ? String(movie.tmdb_id) : null,
              formats: product.formats,
              format: product.formats[0] || null,
              metadata,
            } as any)
            .select()
            .single();

          if (insertError) throw insertError;
          mediaItemId = newItem.id;
        }
      }
    } else {
      // No tmdb_id, search by title
      const { data: titleMatch } = await supabase
        .from("media_items")
        .select("id")
        .eq("user_id", userId)
        .eq("media_type", product.mediaType)
        .ilike("title", movie.title)
        .limit(1);

      if (titleMatch && titleMatch.length > 0) {
        mediaItemId = titleMatch[0].id;
      } else {
        const { data: newItem, error: insertError } = await supabase
          .from("media_items")
          .insert({
            user_id: userId,
            title: movie.title,
            year: movie.year,
            poster_url: product.metadata?.edition?.cover_art_url || movie.poster_url,
            genre: movie.genre || null,
            media_type: product.mediaType,
            formats: product.formats,
            format: product.formats[0] || null,
            metadata: {
              ...(movie.overview ? { overview: movie.overview } : {}),
              edition: {
                package_title: product.productTitle,
                formats: product.formats,
                ...(product.metadata?.edition || {}),
              },
            },
          } as any)
          .select()
          .single();

        if (insertError) throw insertError;
        mediaItemId = newItem.id;
      }
    }

    mediaItemIds.push(mediaItemId);

    // Create the media_copy link
    const { error: mcError } = await supabase
      .from("media_copies")
      .insert({
        media_item_id: mediaItemId,
        physical_product_id: pp.id,
        format: product.formats[0] || null,
      } as any);

    // Ignore duplicate constraint errors (item may already be linked)
    if (mcError && !mcError.message.includes("duplicate")) throw mcError;
  }

  return { physicalProduct: pp, mediaItemIds };
}

/**
 * Creates a multi-season TV physical product (e.g. "Friends: The Complete Series")
 * and links one media_item per season to it.
 *
 * Seasons stay in the current tab's media_type so they remain visible in the
 * collection, while metadata.content_type + the composite external_id preserve
 * their season-specific identity for dedupe and artwork lookups.
 */
export async function createMultiSeasonProduct(
  userId: string,
  product: {
    barcode?: string | null;
    productTitle: string;
    formats: string[];
    mediaType: string;
    discCount?: number;
    purchaseDate?: string | null;
    purchasePrice?: number | null;
    purchaseLocation?: string | null;
    metadata?: Record<string, any>;
  },
  show: {
    tmdb_series_id: number;
    show_name: string;
  },
  seasons: {
    season_number: number;
    title: string;
    year: number | null;
    poster_url: string | null;
    overview?: string | null;
    episode_count?: number | null;
    genre?: string | null;
  }[]
): Promise<{ physicalProduct: any; mediaItemIds: string[] }> {
  // Create the physical product
  const { data: pp, error: ppError } = await supabase
    .from("physical_products")
    .insert({
      user_id: userId,
      barcode: product.barcode || null,
      product_title: product.productTitle,
      formats: product.formats,
      media_type: product.mediaType,
      is_multi_title: true,
      disc_count: product.discCount || seasons.length,
      purchase_date: product.purchaseDate || null,
      purchase_price: product.purchasePrice || null,
      purchase_location: product.purchaseLocation || null,
      metadata: product.metadata || {},
    } as any)
    .select()
    .single();

  if (ppError) throw ppError;

  const mediaItemIds: string[] = [];

  for (const season of seasons) {
    // Composite external_id pins each row to its show + season so future
    // scans (whether single-season or another box set) reuse this row.
    const externalId = `${show.tmdb_series_id}:${season.season_number}`;
    let mediaItemId: string;

    // Look up existing season by external_id first
    const { data: existing } = await supabase
      .from("media_items")
      .select("id")
      .eq("user_id", userId)
      .eq("external_id", externalId)
      .eq("media_type", product.mediaType)
      .limit(1);

    if (existing && existing.length > 0) {
      mediaItemId = existing[0].id;
    } else {
      // Fall back to title match (legacy items)
      const { data: titleMatch } = await supabase
        .from("media_items")
        .select("id")
        .eq("user_id", userId)
        .eq("media_type", product.mediaType)
        .ilike("title", season.title)
        .limit(1);

      if (titleMatch && titleMatch.length > 0) {
        mediaItemId = titleMatch[0].id;
        // Backfill external_id on the legacy row
        await supabase
          .from("media_items")
          .update({ external_id: externalId } as any)
          .eq("id", mediaItemId);
      } else {
        const metadata: Record<string, any> = {
          content_type: "tv_season",
          tmdb_series_id: show.tmdb_series_id,
          season_number: season.season_number,
          series_title: show.show_name,
          show_name: show.show_name,
          edition: {
            package_title: product.productTitle,
            formats: product.formats,
            ...(product.metadata?.edition || {}),
          },
        };
        if (season.overview) metadata.overview = season.overview;
        if (season.episode_count) metadata.episode_count = season.episode_count;

        const { data: newItem, error: insertError } = await supabase
          .from("media_items")
          .insert({
            user_id: userId,
            title: season.title,
            year: season.year,
            poster_url: product.metadata?.edition?.cover_art_url || season.poster_url,
            genre: season.genre || null,
            media_type: product.mediaType,
            external_id: externalId,
            formats: product.formats,
            format: product.formats[0] || null,
            metadata,
          } as any)
          .select()
          .single();

        if (insertError) throw insertError;
        mediaItemId = newItem.id;
      }
    }

    mediaItemIds.push(mediaItemId);

    // Link this season's media_item to the physical_product
    const { error: mcError } = await supabase
      .from("media_copies")
      .insert({
        media_item_id: mediaItemId,
        physical_product_id: pp.id,
        format: product.formats[0] || null,
        disc_label: `Season ${season.season_number}`,
      } as any);

    if (mcError && !mcError.message.includes("duplicate")) throw mcError;
  }

  return { physicalProduct: pp, mediaItemIds };
}

/**
 * Hook to get all physical products for a media item
 */
export function usePhysicalProductsForItem(mediaItemId: string | undefined) {
  return useQuery({
    queryKey: ["physical_products_for_item", mediaItemId],
    queryFn: async () => {
      if (!mediaItemId) return [];

      const { data: copies, error: copiesError } = await supabase
        .from("media_copies")
        .select("physical_product_id, format, disc_label")
        .eq("media_item_id", mediaItemId);

      if (copiesError) throw copiesError;
      if (!copies || copies.length === 0) return [];

      const ppIds = copies.map((c: any) => c.physical_product_id);
      const { data: products, error: ppError } = await supabase
        .from("physical_products")
        .select("*")
        .in("id", ppIds);

      if (ppError) throw ppError;

      // For each product, get all linked media items
      const results = [];
      for (const product of (products || [])) {
        const { data: allCopies } = await supabase
          .from("media_copies")
          .select("media_item_id, format, disc_label")
          .eq("physical_product_id", product.id);

        const linkedItemIds = (allCopies || [])
          .map((c: any) => c.media_item_id)
          .filter((id: string) => id !== mediaItemId);

        let linkedItems: any[] = [];
        if (linkedItemIds.length > 0) {
          const { data: items } = await supabase
            .from("media_items")
            .select("id, title, year, poster_url")
            .in("id", linkedItemIds);
          linkedItems = items || [];
        }

        const copy = copies.find((c: any) => c.physical_product_id === product.id);
        results.push({
          ...product,
          copyFormat: copy?.format,
          copyDiscLabel: copy?.disc_label,
          linkedItems,
        });
      }

      return results;
    },
    enabled: !!mediaItemId,
  });
}

export function useUpdatePhysicalProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<PhysicalProduct>) => {
      const { error } = await supabase
        .from("physical_products")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["physical_products_for_item"] });
      queryClient.invalidateQueries({ queryKey: ["media_items"] });
    },
  });
}
