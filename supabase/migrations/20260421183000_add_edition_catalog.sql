create table if not exists public.edition_catalog (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  media_type text not null default 'movies',
  title text not null,
  year integer,
  external_id text,
  product_title text,
  edition text,
  formats text[] not null default '{}',
  disc_count integer,
  package_image_url text,
  source text not null default 'unknown',
  source_confidence integer not null default 50,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_confirmed_at timestamptz not null default now()
);

create index if not exists idx_edition_catalog_title on public.edition_catalog (media_type, title);
create index if not exists idx_edition_catalog_external_id on public.edition_catalog (external_id);

alter table public.edition_catalog enable row level security;

create policy "Edition catalog readable by anyone"
  on public.edition_catalog
  for select
  using (true);

create policy "Authenticated users can insert edition catalog"
  on public.edition_catalog
  for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update edition catalog"
  on public.edition_catalog
  for update
  to authenticated
  using (true);

create policy "Authenticated users can delete edition catalog"
  on public.edition_catalog
  for delete
  to authenticated
  using (true);

drop trigger if exists update_edition_catalog_updated_at on public.edition_catalog;
create trigger update_edition_catalog_updated_at
before update on public.edition_catalog
for each row
execute function public.update_updated_at_column();
