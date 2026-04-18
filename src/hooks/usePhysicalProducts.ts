import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MediaTab, PhysicalContentType } from "@/lib/types";
import { useQuery } from "@tanstack/react-query";

export interface PhysicalProduct {
  id: string;
  user_id: string;
  barcode: string | null;
  product_title: string;
  formats: string[];
  edition: string | null;
  media_type: string;
  content_type: PhysicalContentType | null;
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
 *
 * `contentType` is passed through to physical_products so downstream UIs can
 * filter box sets, TV products, etc. without joining media_items.
 */
export async function createPhysicalProductForItem(
  userId: string,
  mediaItemId: string,
  opts: {
    barcode?: string | null;
    productTitle: string;
    formats: string[];
    mediaType: string;
    /** Content-type discriminator for the physical product. Defaults to 'movie'. */
    contentType?: PhysicalContentType | null;
    format?: string | null;
    edition?: string | null;
    isMultiTitle?: boolean;
    discCount?: number;
    purchaseDate?: string | null;
    purchasePrice?: number | null;
    purchaseLocation?: string | null;
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
      content_type: opts.contentType ?? null,
      edition: opts.edition || null,
      is_multi_title: opts.isMultiTitle || false,
      disc_count: opts.discCount || 1,
      purchase_date: opts.purchaseDate || null,
      purchase_price: opts.purchasePrice || null,
      purchase_location: opts.purchaseLocation || null,
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
  // Create the physical product. Multi-movie sets are always tagged 'box_set'
  // on the physical layer so collection queries can distinguish them from
  // single-title products without needing to look at is_multi_title.
  const { data: pp, error: ppError } = await supabase
    .from("physical_products")
    .insert({
      user_id: userId,
      barcode: product.barcode || null,
      product_title: product.productTitle,
      formats: product.formats,
      media_type: product.mediaType,
      content_type: "box_set",
      is_multi_title: true,
      disc_count: product.discCount || movies.length,
      purchase_date: product.purchaseDate || null,
      purchase_price: product.purchasePrice || null,
      purchase_location: product.purchaseLocation || null,
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

          const { data: newItem, error: insertError } = await supabase
            .from("media_items")
            .insert({
              user_id: userId,
              title: movie.title,
              year: movie.year,
              poster_url: movie.poster_url,
              genre: movie.genre || null,
              media_type: product.mediaType,
              // Individual items inside a box_set are movies themselves
              // (TMDB collection parts are always movies, not TV).
              content_type: "movie",
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
            poster_url: movie.poster_url,
            genre: movie.genre || null,
            media_type: product.mediaType,
            content_type: "movie",
            formats: product.formats,
            format: product.formats[0] || null,
            metadata: movie.overview ? { overview: movie.overview } : {},
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
