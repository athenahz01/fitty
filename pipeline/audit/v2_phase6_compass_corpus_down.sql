-- Reverse of supabase/migrations/202606280001_v2_phase6_compass_corpus.sql
-- Drops the Major/Career Compass reference tables and their policies.

drop policy if exists "compass careers are public readable" on public.compass_careers;
drop policy if exists "compass majors are public readable" on public.compass_majors;

drop index if exists public.compass_careers_major_idx;

drop table if exists public.compass_careers;
drop table if exists public.compass_majors;
