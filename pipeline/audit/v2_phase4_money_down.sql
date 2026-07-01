-- Reverse of supabase/migrations/202607010001_v2_phase4_money.sql
-- Drops the Money reference tables and their policies.

drop policy if exists "money net price bands are public readable" on public.money_net_price_bands;
drop policy if exists "money merit rules are public readable" on public.money_merit_rules;

drop index if exists public.money_net_price_bands_unitid_idx;
drop index if exists public.money_merit_rules_unitid_idx;

drop table if exists public.money_net_price_bands;
drop table if exists public.money_merit_rules;
