-- V2 Phase 4: Money reference tables.
-- Public, sourced reference data: anon/authenticated may READ, service role
-- writes through the ingest pipeline. Every row must carry an https source_url.
-- Reversible down path: pipeline/audit/v2_phase4_money_down.sql

create table if not exists public.money_merit_rules (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null unique,
  unitid integer not null references public.schools(unitid) on delete cascade,
  school_name text not null,
  country text not null check (country in ('US', 'CA')),
  scholarship_name text not null,
  residency text not null default 'any' check (
    residency in ('any', 'in_state', 'out_of_state', 'domestic', 'international')
  ),
  currency text not null check (currency in ('USD', 'CAD')),
  amount_basis text not null check (amount_basis in ('verified', 'estimate')),
  annual_amount numeric not null check (annual_amount >= 0),
  total_value numeric check (total_value is null or total_value >= 0),
  renewable_years integer check (
    renewable_years is null or (renewable_years >= 1 and renewable_years <= 8)
  ),
  gpa_min numeric check (gpa_min is null or (gpa_min >= 0 and gpa_min <= 5)),
  gpa_max numeric check (gpa_max is null or (gpa_max >= 0 and gpa_max <= 5)),
  sat_min integer check (sat_min is null or (sat_min >= 400 and sat_min <= 1600)),
  sat_max integer check (sat_max is null or (sat_max >= 400 and sat_max <= 1600)),
  act_min integer check (act_min is null or (act_min >= 1 and act_min <= 36)),
  act_max integer check (act_max is null or (act_max >= 1 and act_max <= 36)),
  percentage_min numeric check (
    percentage_min is null or (percentage_min >= 0 and percentage_min <= 100)
  ),
  percentage_max numeric check (
    percentage_max is null or (percentage_max >= 0 and percentage_max <= 100)
  ),
  priority integer not null default 0,
  source_url text not null check (source_url ~* '^https://'),
  provenance text not null default 'curated_public' check (
    provenance in ('curated_public')
  ),
  notes text,
  ingested_at timestamptz not null default now(),
  constraint money_merit_rules_has_criteria check (
    gpa_min is not null or gpa_max is not null or
    sat_min is not null or sat_max is not null or
    act_min is not null or act_max is not null or
    percentage_min is not null or percentage_max is not null
  ),
  constraint money_merit_rules_gpa_range check (
    gpa_min is null or gpa_max is null or gpa_min <= gpa_max
  ),
  constraint money_merit_rules_sat_range check (
    sat_min is null or sat_max is null or sat_min <= sat_max
  ),
  constraint money_merit_rules_act_range check (
    act_min is null or act_max is null or act_min <= act_max
  ),
  constraint money_merit_rules_percentage_range check (
    percentage_min is null or percentage_max is null or percentage_min <= percentage_max
  )
);

create table if not exists public.money_net_price_bands (
  id uuid primary key default gen_random_uuid(),
  unitid integer not null references public.schools(unitid) on delete cascade,
  school_name text not null,
  country text not null check (country in ('US', 'CA')),
  residency text not null default 'any' check (
    residency in ('any', 'in_state', 'out_of_state', 'domestic', 'international')
  ),
  income_band text not null check (
    income_band in (
      '0-30000',
      '30001-48000',
      '48001-75000',
      '75001-110000',
      '110001-plus',
      'overall'
    )
  ),
  currency text not null check (currency in ('USD', 'CAD')),
  sticker_price numeric not null check (sticker_price >= 0),
  net_price numeric not null check (net_price >= 0),
  median_earnings_10yr numeric check (
    median_earnings_10yr is null or median_earnings_10yr >= 0
  ),
  basis text not null check (basis in ('verified', 'estimate')),
  earnings_basis text check (
    earnings_basis is null or earnings_basis in ('verified', 'estimate')
  ),
  source_url text not null check (source_url ~* '^https://'),
  earnings_source_url text check (
    earnings_source_url is null or earnings_source_url ~* '^https://'
  ),
  source_year text,
  provenance text not null check (
    provenance in ('college_scorecard_api', 'curated_public')
  ),
  notes text,
  ingested_at timestamptz not null default now(),
  unique (unitid, residency, income_band)
);

create index if not exists money_merit_rules_unitid_idx
  on public.money_merit_rules (unitid);

create index if not exists money_net_price_bands_unitid_idx
  on public.money_net_price_bands (unitid);

alter table public.money_merit_rules enable row level security;
alter table public.money_net_price_bands enable row level security;

drop policy if exists "money merit rules are public readable" on public.money_merit_rules;
create policy "money merit rules are public readable"
on public.money_merit_rules
for select
to anon, authenticated
using (true);

drop policy if exists "money net price bands are public readable" on public.money_net_price_bands;
create policy "money net price bands are public readable"
on public.money_net_price_bands
for select
to anon, authenticated
using (true);
