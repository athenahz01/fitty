-- V2 Phase 0: Canada foundations.
-- Up migration. The executable down path lives in:
--   pipeline/audit/v2_phase0_canada_foundations_down.sql

create extension if not exists pgcrypto;

alter table public.schools
  add column if not exists country text,
  add column if not exists province_state text,
  add column if not exists admission_system text,
  add column if not exists grading_basis text,
  add column if not exists broad_based_admission boolean,
  add column if not exists merit_auto jsonb;

update public.schools
set
  country = coalesce(country, 'US'),
  province_state = coalesce(province_state, state),
  grading_basis = coalesce(grading_basis, 'gpa_4_0'),
  broad_based_admission = coalesce(broad_based_admission, false);

alter table public.schools
  alter column country set default 'US',
  alter column country set not null,
  alter column grading_basis set default 'gpa_4_0',
  alter column grading_basis set not null,
  alter column broad_based_admission set default false,
  alter column broad_based_admission set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'schools_country_check'
      and conrelid = 'public.schools'::regclass
  ) then
    alter table public.schools
      add constraint schools_country_check
      check (country in ('US', 'CA'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'schools_admission_system_check'
      and conrelid = 'public.schools'::regclass
  ) then
    alter table public.schools
      add constraint schools_admission_system_check
      check (
        admission_system is null
        or admission_system in (
          'common_app',
          'coalition',
          'ouac',
          'direct',
          'quebec_cegep'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'schools_grading_basis_check'
      and conrelid = 'public.schools'::regclass
  ) then
    alter table public.schools
      add constraint schools_grading_basis_check
      check (grading_basis in ('gpa_4_0', 'percentage', 'cegep_r_score'));
  end if;
end $$;

create index if not exists schools_country_idx
  on public.schools (country);

create index if not exists schools_province_state_idx
  on public.schools (province_state);

create table if not exists public.program_requirements (
  id uuid primary key default gen_random_uuid(),
  unitid integer not null references public.schools(unitid),
  program_name text not null,
  system text check (
    system is null
    or system in ('common_app', 'coalition', 'ouac', 'direct', 'quebec_cegep')
  ),
  cutoff_avg_low numeric,
  cutoff_avg_high numeric,
  cutoff_basis text check (
    cutoff_basis is null
    or cutoff_basis in ('gpa_4_0', 'percentage', 'cegep_r_score')
  ),
  prerequisites jsonb,
  test_policy text check (
    test_policy is null
    or test_policy in ('required', 'optional', 'blind', 'unknown')
  ),
  supplemental_app boolean not null default false,
  broad_based_admission boolean not null default false,
  source_url text not null check (source_url ~* '^https?://'),
  ingested_at timestamptz not null default now(),
  constraint program_requirements_cutoff_order_check
    check (
      cutoff_avg_low is null
      or cutoff_avg_high is null
      or cutoff_avg_low <= cutoff_avg_high
    )
);

create index if not exists program_requirements_unitid_idx
  on public.program_requirements (unitid);

create index if not exists program_requirements_system_idx
  on public.program_requirements (system);

alter table public.schools enable row level security;
alter table public.program_requirements enable row level security;

drop policy if exists "schools are public readable" on public.schools;
create policy "schools are public readable"
on public.schools
for select
to anon, authenticated
using (true);

drop policy if exists "program requirements are public readable" on public.program_requirements;
create policy "program requirements are public readable"
on public.program_requirements
for select
to anon, authenticated
using (true);

drop function if exists public.match_fit_schools(
  vector, integer, text, text, text, numeric
);

create or replace function public.match_fit_schools(
  p_query_embedding vector(384),
  p_match_count integer default 60,
  p_preferred_region text default null,
  p_preferred_size text default null,
  p_preferred_setting text default null,
  p_cost_ceiling numeric default null,
  p_include_canada boolean default false
)
returns table (
  unitid integer,
  name text,
  state text,
  province_state text,
  country text,
  admission_system text,
  grading_basis text,
  broad_based_admission boolean,
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
    s.province_state,
    s.country,
    s.admission_system,
    s.grading_basis,
    s.broad_based_admission,
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
    and (p_include_canada or s.country = 'US')
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
