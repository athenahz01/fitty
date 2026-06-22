-- Fit Finder phase 3: specific program titles and honest filter columns.
-- Additive only. Existing chance columns and the schools primary key are
-- untouched. After applying this, the human re-runs:
--   npm run fit:enrich   (populates programs + control from public Scorecard)
--   npm run fit:embed    (re-embeds the enriched school documents)

alter table public.schools
  add column if not exists programs jsonb,
  add column if not exists control text check (
    control is null or control in ('public', 'private')
  );

-- Recreate the match function so it also returns the specific program titles and
-- the public/private control field. Hard filters stay region/size/setting/cost;
-- selectivity tier, graduation-rate floor, and control are applied in the API
-- layer so the candidate pool is not starved before ranking by program fit.
create or replace function public.match_fit_schools(
  p_query_embedding vector(384),
  p_match_count integer default 60,
  p_preferred_region text default null,
  p_preferred_size text default null,
  p_preferred_setting text default null,
  p_cost_ceiling numeric default null
)
returns table (
  unitid integer,
  name text,
  state text,
  setting text,
  size integer,
  admit_rate numeric,
  sat_25 integer,
  sat_75 integer,
  act_25 integer,
  act_75 integer,
  gpa_avg numeric,
  test_policy text,
  c7_factors jsonb,
  selectivity_tier text,
  program_areas jsonb,
  programs jsonb,
  control text,
  size_band text,
  region text,
  net_price_avg numeric,
  sticker_cost numeric,
  median_earnings_10yr numeric,
  completion_rate numeric,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select
    s.unitid,
    s.name,
    s.state,
    s.setting,
    s.size,
    s.admit_rate,
    s.sat_25,
    s.sat_75,
    s.act_25,
    s.act_75,
    s.gpa_avg,
    s.test_policy,
    s.c7_factors,
    s.selectivity_tier,
    s.program_areas,
    s.programs,
    s.control,
    s.size_band,
    s.region,
    s.net_price_avg,
    s.sticker_cost,
    s.median_earnings_10yr,
    s.completion_rate,
    1 - (s.embedding <=> p_query_embedding) as similarity
  from public.schools s
  where s.embedding is not null
    and (p_preferred_region is null or s.region = p_preferred_region)
    and (p_preferred_size is null or s.size_band = p_preferred_size)
    and (p_preferred_setting is null or s.setting = p_preferred_setting)
    and (
      p_cost_ceiling is null
      or coalesce(s.net_price_avg, s.sticker_cost) <= p_cost_ceiling
      or (s.net_price_avg is null and s.sticker_cost is null)
    )
  order by s.embedding <=> p_query_embedding, s.unitid
  limit least(greatest(p_match_count, 1), 100);
$$;
