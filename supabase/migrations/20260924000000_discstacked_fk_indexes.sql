-- Supabase performance advisor, lint 0001 (unindexed_foreign_keys).
-- Adds a covering index for each foreign key on discstacked.import_staging
-- that the advisor flagged as missing one. Confirmed via a read-only join of
-- information_schema.table_constraints / key_column_usage against the live
-- database, and cross-checked against pg_index to confirm no existing index
-- on this table (there are 7: barcode, batch, box_set_name, imdb_id, year,
-- pkey, status, tmdb_id, source_user_id) already covers either column -- see
-- the PR body for both queries.
--
-- Purely additive: no table is altered, no column added, no row touched.
-- CREATE INDEX IF NOT EXISTS is safe to run twice.
BEGIN;

CREATE INDEX IF NOT EXISTS idx_import_staging_matched_media_item_id
  ON discstacked.import_staging (matched_media_item_id);

CREATE INDEX IF NOT EXISTS idx_import_staging_matched_physical_product_id
  ON discstacked.import_staging (matched_physical_product_id);

COMMIT;
