-- Fix auth_rls_initplan (Supabase performance advisor 0003) on the discstacked schema:
-- wrap auth.uid()/auth.role() in a scalar subselect so Postgres caches it once
-- per statement instead of re-evaluating it for every row. Semantics are
-- unchanged -- same predicate, same result set -- this is purely a query-plan
-- optimization Supabase documents as the fix for this exact lint. Every
-- predicate below was copied verbatim from this schema's live pg_policies via
-- a read-only query; only the auth.<fn>() wrapping changed.
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

begin;

-- edition_catalog
alter policy "Admins can delete edition catalog" on discstacked.edition_catalog
  using (discstacked.has_role((select auth.uid()), 'admin'::discstacked.app_role));
alter policy "Authenticated users can insert edition catalog" on discstacked.edition_catalog
  with check (((select auth.role()) = 'authenticated'::text));
alter policy "Authenticated users can update edition catalog" on discstacked.edition_catalog
  using (((select auth.role()) = 'authenticated'::text))
  with check (((select auth.role()) = 'authenticated'::text));
alter policy "Edition catalog readable by app clients" on discstacked.edition_catalog
  using (((select auth.role()) = ANY (ARRAY['anon'::text, 'authenticated'::text])));

-- import_staging
alter policy "users insert their own staging rows" on discstacked.import_staging
  with check (((select auth.uid()) = source_user_id));
alter policy "users see their own staging rows" on discstacked.import_staging
  using (((select auth.uid()) = source_user_id));
alter policy "users update their own staging rows" on discstacked.import_staging
  using (((select auth.uid()) = source_user_id));

-- media_copies
alter policy "Users can delete own copies" on discstacked.media_copies
  using ((EXISTS ( SELECT 1
   FROM discstacked.media_items mi
  WHERE ((mi.id = media_copies.media_item_id) AND (mi.user_id = (select auth.uid()))))));
alter policy "Users can insert own copies" on discstacked.media_copies
  with check ((EXISTS ( SELECT 1
   FROM discstacked.media_items mi
  WHERE ((mi.id = media_copies.media_item_id) AND (mi.user_id = (select auth.uid()))))));
alter policy "Users can update own copies" on discstacked.media_copies
  using ((EXISTS ( SELECT 1
   FROM discstacked.media_items mi
  WHERE ((mi.id = media_copies.media_item_id) AND (mi.user_id = (select auth.uid()))))));
alter policy "Users can view own copies" on discstacked.media_copies
  using ((EXISTS ( SELECT 1
   FROM discstacked.media_items mi
  WHERE ((mi.id = media_copies.media_item_id) AND (mi.user_id = (select auth.uid()))))));

-- media_items
alter policy "Users can delete their own items" on discstacked.media_items
  using (((select auth.uid()) = user_id));
alter policy "Users can insert their own items" on discstacked.media_items
  with check (((select auth.uid()) = user_id));
alter policy "Users can update their own items" on discstacked.media_items
  using (((select auth.uid()) = user_id));
alter policy "Users can view their own items" on discstacked.media_items
  using (((select auth.uid()) = user_id));

-- physical_products
alter policy "Users can delete own products" on discstacked.physical_products
  using (((select auth.uid()) = user_id));
alter policy "Users can insert own products" on discstacked.physical_products
  with check (((select auth.uid()) = user_id));
alter policy "Users can update own products" on discstacked.physical_products
  using (((select auth.uid()) = user_id));
alter policy "Users can view own products" on discstacked.physical_products
  using (((select auth.uid()) = user_id));

-- profiles
alter policy "Users can insert their own profile" on discstacked.profiles
  with check (((select auth.uid()) = user_id));
alter policy "Users can update their own profile" on discstacked.profiles
  using (((select auth.uid()) = user_id));
alter policy "Users can view own profile" on discstacked.profiles
  using (((select auth.uid()) = user_id));

-- user_roles
alter policy "Admins can delete roles" on discstacked.user_roles
  using (discstacked.has_role((select auth.uid()), 'admin'::discstacked.app_role));
alter policy "Admins can insert roles" on discstacked.user_roles
  with check (discstacked.has_role((select auth.uid()), 'admin'::discstacked.app_role));
alter policy "Admins can view all roles" on discstacked.user_roles
  using (discstacked.has_role((select auth.uid()), 'admin'::discstacked.app_role));
alter policy "Users can view own roles" on discstacked.user_roles
  using (((select auth.uid()) = user_id));

commit;
