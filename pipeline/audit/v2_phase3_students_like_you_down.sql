drop function if exists public.match_similar_cohort(vector, integer, uuid, integer, integer, integer);
drop function if exists public.admira_label_or_unknown(text, text);
drop function if exists public.admira_test_band(integer, integer, boolean);
drop function if exists public.admira_gpa_band(numeric);

drop index if exists public.application_outcomes_provenance_idx;
drop index if exists public.applicant_profiles_provenance_idx;
drop index if exists public.applicant_profiles_embedding_cosine_idx;

alter table public.application_outcomes
  drop constraint if exists application_outcomes_curated_source_check,
  drop constraint if exists application_outcomes_provenance_check,
  drop column if exists source_url,
  drop column if exists provenance;

alter table public.applicant_profiles
  drop constraint if exists applicant_profiles_curated_source_check,
  drop constraint if exists applicant_profiles_provenance_check,
  drop column if exists source_url,
  drop column if exists provenance,
  drop column if exists profile_embedding_model,
  drop column if exists profile_embedding;
