create extension if not exists vector;

alter table public.schools
  add column if not exists program_areas jsonb,
  add column if not exists size_band text check (
    size_band is null or size_band in ('small', 'medium', 'large')
  ),
  add column if not exists region text check (
    region is null or region in ('Northeast', 'Midwest', 'South', 'West')
  ),
  add column if not exists net_price_avg numeric check (
    net_price_avg is null or net_price_avg >= 0
  ),
  add column if not exists sticker_cost numeric check (
    sticker_cost is null or sticker_cost >= 0
  ),
  add column if not exists median_earnings_10yr numeric check (
    median_earnings_10yr is null or median_earnings_10yr >= 0
  ),
  add column if not exists completion_rate numeric check (
    completion_rate is null or (completion_rate >= 0 and completion_rate <= 1)
  ),
  add column if not exists embedding vector(384);

create index if not exists schools_region_idx
  on public.schools (region);

create index if not exists schools_size_band_idx
  on public.schools (size_band);

create index if not exists schools_embedding_cosine_idx
  on public.schools
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10)
  where embedding is not null;
