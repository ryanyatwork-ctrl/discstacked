// Convert a CLZ Movie Collector XML export (MyMovies.xml) into a CSV that the
// DiscStacked importer resolves exactly.
//
// - Movies carry the TMDB id (CLZ <tmdbid>) → mapped to external_id, so no
//   barcode/title guessing.
// - TV seasons rarely have a TMDB id in CLZ, but almost always have the series
//   IMDb id (CLZ <imdburl>). That IMDb id is the exact anchor: DiscStacked's
//   metadata refresh resolves it to a TMDB series, then fetches the season.
//   The "TMDb Series ID" column is emitted for completeness (blank unless the
//   export provides one) and is honored by the importer if filled.
//
// Usage: node clz-xml-to-csv.mjs "<path to MyMovies.xml>" "<output.csv>"
import fs from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('Usage: node clz-xml-to-csv.mjs <MyMovies.xml> <output.csv>');
  process.exit(1);
}

const xml = fs.readFileSync(inPath, "latin1");
const blocks = xml.split("<movie>").slice(1).map((b) => b.slice(0, b.indexOf("</movie>")));

function firstTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : "";
}
// A <foo><displayname>X</displayname>... structured field.
function displayOf(block, tag) {
  const m = block.match(new RegExp(`<${tag}>[\\s\\S]*?<displayname>([\\s\\S]*?)<\\/displayname>`));
  return m ? m[1].trim() : "";
}
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const rows = [];
let withTmdb = 0, withUpc = 0, tvish = 0, boxsets = 0;

for (const b of blocks) {
  // Prefer the human title element; fall back to sort title.
  const title = firstTag(b, "title") || firstTag(b, "titlesort");
  if (!title) continue;

  const year = displayOf(b, "releasedate") || displayOf(b, "dvdreleasedate") || "";
  const tmdb = firstTag(b, "tmdbid");
  const upcRaw = firstTag(b, "upc").replace(/[^0-9]/g, "");
  const format = displayOf(b, "format");
  const edition = displayOf(b, "edition");
  const discs = firstTag(b, "nritems") || displayOf(b, "nritems");
  const isBoxSet = /<boxset>\s*<displayname>[^<]+/.test(b);
  const imdbUrl = firstTag(b, "imdburl");
  const imdb = (imdbUrl.match(/tt\d+/i) || [""])[0];

  if (tmdb) withTmdb++;
  if (upcRaw) withUpc++;
  if (/season|complete series/i.test(title) || /season|complete series/i.test(edition)) tvish++;
  if (isBoxSet) boxsets++;

  // A TMDB id on a TV row would be a movie id (or absent) — never a series id.
  // Keep the movie TMDb ID column clear for TV so it can't be mistaken for the
  // series identity; TV relies on the IMDb id anchor instead.
  const isTvRow = /season|complete series|mini-?series/i.test(title) || /complete\s+season|complete\s+series/i.test(edition);

  rows.push({
    Title: title,
    Year: /^\d{4}$/.test(year) ? year : "",
    Format: format,
    Edition: edition,
    Barcode: upcRaw,
    "TMDb ID": isTvRow ? "" : tmdb,
    "TMDb Series ID": "",
    "IMDb ID": imdb,
    "Disc Count": /^\d+$/.test(discs) ? discs : "",
  });
}

const headers = ["Title", "Year", "Format", "Edition", "Barcode", "TMDb ID", "TMDb Series ID", "IMDb ID", "Disc Count"];
const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\n");
fs.writeFileSync(outPath, csv, "utf8");

console.log(`Wrote ${rows.length} rows → ${outPath}`);
console.log(`  with TMDB id: ${withTmdb} (${Math.round((withTmdb / rows.length) * 100)}%)`);
console.log(`  with barcode: ${withUpc} (${Math.round((withUpc / rows.length) * 100)}%)`);
console.log(`  TV season/series rows: ${tvish} | in a box set: ${boxsets}`);
