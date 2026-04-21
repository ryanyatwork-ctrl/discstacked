import fs from "node:fs";
import path from "node:path";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r" && next === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim());
  return rows.slice(1)
    .filter((values) => values.some((value) => String(value || "").trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, String(values[index] || "").trim()])));
}

function detectFormats(value) {
  const lower = value.toLowerCase();
  const formats = [];

  if (/\b(4k|uhd|ultra hd)\b/.test(lower)) formats.push("4K");
  if (/\b(blu-ray|blu ray|bluray|bd-25|bd-50|bd-66|bd-100|dts-hd|truehd|true hd)\b/.test(lower)) formats.push("Blu-ray");
  if (/\b3d\b/.test(lower)) formats.push("3D");
  if (/\bdvd\b/.test(lower)) formats.push("DVD");
  if (
    /\b(digital copy|digital code|digital hd|movies anywhere|ultraviolet)\b/.test(lower) ||
    /\b(?:blu-?ray|blu ray|dvd|4k|uhd|ultra hd)\b[^\n]{0,24}(?:\+|\/|&)\s*digital\b/.test(lower) ||
    /\bdigital\b[^\n]{0,24}(?:\+|\/|&)\s*(?:blu-?ray|blu ray|dvd|4k|uhd|ultra hd)\b/.test(lower)
  ) {
    formats.push("Digital");
  }
  if (/\bultraviolet\b/.test(lower)) formats.push("UltraViolet");

  return [...new Set(formats)];
}

function parseInteger(value) {
  const parsed = parseInt(String(value || "").match(/\d+/)?.[0] || "", 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function sqlString(value) {
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function buildSeedRows(rows) {
  const byBarcode = new Map();

  for (const row of rows) {
    const barcode = row.Barcode?.trim();
    const title = row.Title?.trim();
    if (!barcode || !title) continue;

    const edition = row.Edition?.trim() || null;
    const year = parseInteger(row["Movie Release Year"]);
    const discCount = parseInteger(row["No. of Discs/Tapes"]);
    const runtime = parseInteger(row["Running Time"]);
    const audioTracks = row["Audio Tracks"]?.trim() || null;
    const subtitles = row.Subtitles?.trim() || null;
    const formats = detectFormats([edition, audioTracks].filter(Boolean).join(" ; "));
    const productTitle = edition ? `${title} (${edition})` : title;

    const metadata = {
      runtime,
      running_time: row["Running Time"] || null,
      disc_count: discCount,
      audio_tracks: audioTracks,
      subtitles,
      clz_csv_verified: true,
      edition: {
        label: edition,
        package_title: productTitle,
        formats,
        disc_count: discCount,
      },
    };

    const next = {
      barcode,
      media_type: "movies",
      title,
      year,
      product_title: productTitle,
      edition,
      formats,
      disc_count: discCount,
      source: "clz_csv",
      source_confidence: 95,
      metadata,
    };

    const existing = byBarcode.get(barcode);
    if (!existing) {
      byBarcode.set(barcode, next);
      continue;
    }

    byBarcode.set(barcode, {
      ...existing,
      title: existing.title || next.title,
      year: existing.year ?? next.year,
      product_title: existing.product_title.length >= next.product_title.length ? existing.product_title : next.product_title,
      edition: existing.edition || next.edition,
      formats: [...new Set([...(existing.formats || []), ...(next.formats || [])])],
      disc_count: existing.disc_count ?? next.disc_count,
      metadata: {
        ...existing.metadata,
        ...next.metadata,
        edition: {
          ...(existing.metadata?.edition || {}),
          ...(next.metadata?.edition || {}),
          formats: [...new Set([
            ...((existing.metadata?.edition?.formats) || []),
            ...((next.metadata?.edition?.formats) || []),
          ])],
        },
      },
    });
  }

  return [...byBarcode.values()];
}

function buildSql(seedRows) {
  const payload = seedRows.map((row) => ({
    ...row,
    metadata: row.metadata || {},
  }));
  const json = sqlString(payload);

  return `with payload as (
  select *
  from jsonb_to_recordset($json$${json}$json$::jsonb) as x(
    barcode text,
    media_type text,
    title text,
    year int,
    product_title text,
    edition text,
    formats text[],
    disc_count int,
    source text,
    source_confidence int,
    metadata jsonb
  )
)
insert into public.edition_catalog (
  barcode,
  media_type,
  title,
  year,
  product_title,
  edition,
  formats,
  disc_count,
  source,
  source_confidence,
  metadata,
  last_confirmed_at
)
select
  barcode,
  media_type,
  title,
  year,
  product_title,
  edition,
  formats,
  disc_count,
  source,
  source_confidence,
  metadata,
  now()
from payload
on conflict (barcode) do update set
  media_type = excluded.media_type,
  title = excluded.title,
  year = coalesce(excluded.year, public.edition_catalog.year),
  product_title = excluded.product_title,
  edition = coalesce(excluded.edition, public.edition_catalog.edition),
  formats = case
    when coalesce(array_length(excluded.formats, 1), 0) > 0 then excluded.formats
    else public.edition_catalog.formats
  end,
  disc_count = coalesce(excluded.disc_count, public.edition_catalog.disc_count),
  source = case
    when public.edition_catalog.source = 'discstacked_confirmed' then public.edition_catalog.source
    else excluded.source
  end,
  source_confidence = greatest(coalesce(public.edition_catalog.source_confidence, 0), coalesce(excluded.source_confidence, 0)),
  metadata = coalesce(public.edition_catalog.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
  last_confirmed_at = now();`;
}

function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3] || path.join(process.cwd(), "tmp", "clz_csv_sync.sql");
  const jsonOutputPath = outputPath.replace(/\.sql$/i, ".json");

  if (!inputPath) {
    console.error("Usage: node scripts/sync-clz-csv-to-edition-catalog.mjs <input.csv> [output.sql]");
    process.exit(1);
  }

  const text = fs.readFileSync(inputPath, "utf8");
  const rows = parseCsv(text);
  const seedRows = buildSeedRows(rows);
  const sql = buildSql(seedRows);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, sql);
  fs.writeFileSync(jsonOutputPath, JSON.stringify(seedRows, null, 2));

  const withBarcode = rows.filter((row) => row.Barcode?.trim()).length;
  const withEdition = rows.filter((row) => row.Edition?.trim()).length;
  const withFormats = seedRows.filter((row) => row.formats.length > 0).length;

  console.log(JSON.stringify({
    inputPath,
    outputPath,
    jsonOutputPath,
    rowCount: rows.length,
    withBarcode,
    uniqueBarcodes: seedRows.length,
    withEdition,
    withDetectedFormats: withFormats,
  }, null, 2));
}

main();
