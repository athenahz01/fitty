-- V2 Phase 6: Major/Career Compass reference tables.
-- Public, sourced reference data (like schools): anon/authenticated may READ,
-- only the service role may write. Every row must carry an https source_url.
-- Essays are intentionally ephemeral this phase, so there is NO essay storage
-- table here. The essay-pattern corpus is a committed JSON fixture, not a table.
-- Reversible down path: pipeline/audit/v2_phase6_compass_corpus_down.sql

create table if not exists public.compass_majors (
  id uuid primary key default gen_random_uuid(),
  major_name text not null unique,
  scorecard_field text,
  median_earnings_10yr numeric,
  source_url text not null check (source_url ~* '^https?://'),
  provenance text not null default 'curated_public' check (provenance in ('curated_public')),
  ingested_at timestamptz not null default now()
);

create table if not exists public.compass_careers (
  id uuid primary key default gen_random_uuid(),
  major_name text not null,
  career_title text not null,
  onet_code text,
  median_wage_annual numeric,
  source_url text not null check (source_url ~* '^https?://'),
  provenance text not null default 'curated_public' check (provenance in ('curated_public')),
  ingested_at timestamptz not null default now()
);

create index if not exists compass_careers_major_idx
  on public.compass_careers (major_name);

alter table public.compass_majors enable row level security;
alter table public.compass_careers enable row level security;

drop policy if exists "compass majors are public readable" on public.compass_majors;
create policy "compass majors are public readable"
on public.compass_majors
for select
to anon, authenticated
using (true);

drop policy if exists "compass careers are public readable" on public.compass_careers;
create policy "compass careers are public readable"
on public.compass_careers
for select
to anon, authenticated
using (true);
