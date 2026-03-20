import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Google Books search (if key available)
async function googleBooksSearch(query: string, isbn?: string, maxResults = 8) {
  const key = Deno.env.get("GOOGLE_BOOKS_API_KEY");
  if (!key) return null;

  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (isbn) {
    params.set("q", `isbn:${isbn}`);
  } else {
    params.set("q", query);
    params.set("printType", "books");
  }
  params.set("key", key);

  const res = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!res.ok) return null;
  const data = await res.json();

  return (data.items || []).map((item: any) => {
    const v = item.volumeInfo;
    const ids = v.industryIdentifiers || [];
    const isbn13 = ids.find((i: any) => i.type === "ISBN_13")?.identifier;
    const isbn10 = ids.find((i: any) => i.type === "ISBN_10")?.identifier;
    return {
      id: item.id,
      title: v.title,
      author: v.authors?.join(", ") || "Unknown Author",
      description: v.description || null,
      page_count: v.pageCount || null,
      cover_url: v.imageLinks?.thumbnail?.replace("http:", "https:") || null,
      categories: v.categories || [],
      published_date: v.publishedDate || null,
      publisher: v.publisher || null,
      isbn: isbn13 || isbn10 || null,
      source: "google_books",
    };
  });
}

// Open Library search (always free)
async function openLibrarySearch(query: string, isbn?: string) {
  if (isbn) {
    const cleanISBN = isbn.replace(/[-\s]/g, "");
    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanISBN}&format=json&jscmd=data`
    );
    if (!res.ok) return [];
    const data = await res.json();
    const book = data[`ISBN:${cleanISBN}`];
    if (!book) return [];
    return [{
      id: cleanISBN,
      title: book.title,
      author: book.authors?.map((a: any) => a.name).join(", ") || "Unknown Author",
      description: null,
      page_count: book.number_of_pages || null,
      cover_url: book.cover?.medium || null,
      categories: book.subjects?.slice(0, 5).map((s: any) => s.name) || [],
      published_date: book.publish_date || null,
      publisher: book.publishers?.[0]?.name || null,
      isbn: cleanISBN,
      source: "open_library",
    }];
  }

  const encoded = encodeURIComponent(query);
  const res = await fetch(
    `https://openlibrary.org/search.json?q=${encoded}&limit=8&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i,subject,publisher,isbn`
  );
  if (!res.ok) return [];
  const data = await res.json();

  return (data.docs || []).map((doc: any) => ({
    id: doc.key,
    title: doc.title,
    author: doc.author_name?.join(", ") || "Unknown Author",
    description: null,
    page_count: doc.number_of_pages_median || null,
    cover_url: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : null,
    categories: doc.subject?.slice(0, 5) || [],
    published_date: doc.first_publish_year ? String(doc.first_publish_year) : null,
    publisher: doc.publisher?.[0] || null,
    isbn: doc.isbn?.[0] || null,
    source: "open_library",
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, isbn, barcode } = await req.json();
    const searchIsbn = isbn || barcode;

    // Try Google Books first, fallback to Open Library
    let results = await googleBooksSearch(query || "", searchIsbn);
    if (!results || results.length === 0) {
      results = await openLibrarySearch(query || "", searchIsbn);
    }

    // If barcode/ISBN lookup returned a single result, return it directly
    if (searchIsbn && results && results.length === 1) {
      const r = results[0];
      return new Response(JSON.stringify({
        title: r.title,
        author: r.author,
        year: r.published_date ? parseInt(r.published_date) : null,
        poster_url: r.cover_url,
        genre: r.categories?.join(", ") || null,
        page_count: r.page_count,
        publisher: r.publisher,
        isbn: r.isbn,
        description: r.description,
        source: r.source,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ results: results || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
