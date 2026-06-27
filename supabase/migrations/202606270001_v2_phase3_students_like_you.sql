create extension if not exists vector;

alter table public.applicant_profiles
  add column if not exists profile_embedding vector(384),
  add column if not exists profile_embedding_model text,
  add column if not exists provenance text not null default 'consented_user',
  add column if not exists source_url text;

alter table public.applicant_profiles
  drop constraint if exists applicant_profiles_provenance_check,
  add constraint applicant_profiles_provenance_check
    check (provenance in ('consented_user', 'curated_public'));

alter table public.applicant_profiles
  drop constraint if exists applicant_profiles_curated_source_check,
  add constraint applicant_profiles_curated_source_check
    check (provenance <> 'curated_public' or source_url is not null);

alter table public.application_outcomes
  add column if not exists provenance text not null default 'consented_user',
  add column if not exists source_url text;

alter table public.application_outcomes
  drop constraint if exists application_outcomes_provenance_check,
  add constraint application_outcomes_provenance_check
    check (provenance in ('consented_user', 'curated_public'));

alter table public.application_outcomes
  drop constraint if exists application_outcomes_curated_source_check,
  add constraint application_outcomes_curated_source_check
    check (provenance <> 'curated_public' or source_url is not null);

create index if not exists applicant_profiles_embedding_cosine_idx
  on public.applicant_profiles
  using ivfflat (profile_embedding vector_cosine_ops)
  with (lists = 10)
  where profile_embedding is not null;

create index if not exists applicant_profiles_provenance_idx
  on public.applicant_profiles (provenance);

create index if not exists application_outcomes_provenance_idx
  on public.application_outcomes (provenance);

create or replace function public.admira_gpa_band(value numeric)
returns text
language sql
immutable
as $$
  select case
    when value is null then 'GPA not reported'
    when value >= 4.0 then '4.0+'
    when value >= 3.75 then '3.75-3.99'
    when value >= 3.5 then '3.50-3.74'
    when value >= 3.0 then '3.00-3.49'
    else 'Below 3.00'
  end;
$$;

create or replace function public.admira_test_band(
  sat integer,
  act integer,
  submitted boolean
)
returns text
language sql
immutable
as $$
  select case
    when submitted is false then 'No submitted test'
    when sat is not null and sat >= 1500 then '1500+ SAT'
    when sat is not null and sat >= 1400 then '1400-1490 SAT'
    when sat is not null and sat >= 1300 then '1300-1390 SAT'
    when sat is not null then 'Below 1300 SAT'
    when act is not null and act >= 34 then '34+ ACT'
    when act is not null and act >= 30 then '30-33 ACT'
    when act is not null and act >= 26 then '26-29 ACT'
    when act is not null then 'Below 26 ACT'
    else 'Test not reported'
  end;
$$;

create or replace function public.admira_label_or_unknown(value text, fallback text)
returns text
language sql
immutable
as $$
  select case
    when value is null or value = '' or value = 'unknown' then fallback
    else replace(initcap(replace(value, '_', ' ')), 'Ap ', 'AP ')
  end;
$$;

create or replace function public.match_similar_cohort(
  p_profile_embedding vector(384),
  p_unitid integer default null,
  p_exclude_subject_id uuid default null,
  p_exclude_cycle_year integer default null,
  p_k integer default 5,
  p_match_count integer default 80
)
returns table (
  unitid integer,
  school_name text,
  cohort_size integer,
  admitted_count integer,
  denied_count integer,
  waitlisted_count integer,
  deferred_count integer,
  admit_rate numeric,
  denied_rate numeric,
  waitlisted_rate numeric,
  deferred_rate numeric,
  similarity_min double precision,
  similarity_max double precision,
  attribute_cards jsonb,
  admit_insights jsonb,
  provenance jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      greatest(coalesce(p_k, 5), 5) as k,
      least(greatest(coalesce(p_match_count, 80), 5), 200) as match_count
  ),
  eligible as (
    select
      outcome.id as outcome_id,
      outcome.subject_id,
      outcome.unitid,
      school.name as school_name,
      outcome.outcome,
      outcome.cycle_year,
      profile.gpa,
      profile.sat_score,
      profile.act_score,
      profile.test_submitted,
      profile.course_rigor,
      profile.activities_tier,
      profile.application_round,
      profile.demonstrated_interest,
      profile.profile_embedding,
      outcome.provenance as outcome_provenance,
      coalesce(outcome.source_url, profile.source_url) as source_url
    from public.application_outcomes outcome
    join public.applicant_profiles profile
      on profile.id = outcome.profile_id
     and profile.consent_record_id = outcome.consent_record_id
     and profile.subject_id = outcome.subject_id
    join public.consent_records consent
      on consent.id = outcome.consent_record_id
     and consent.subject_id = outcome.subject_id
     and consent.purpose = 'real_outcome_modeling'
     and consent.revoked_at is null
    join public.schools school
      on school.unitid = outcome.unitid
    where p_profile_embedding is not null
      and profile.profile_embedding is not null
      and (p_unitid is null or outcome.unitid = p_unitid)
      and (
        p_exclude_subject_id is null
        or outcome.subject_id <> p_exclude_subject_id
      )
      and (
        p_exclude_subject_id is null
        or p_exclude_cycle_year is null
        or outcome.subject_id <> p_exclude_subject_id
        or outcome.cycle_year <> p_exclude_cycle_year
      )
  ),
  ranked as (
    select
      eligible.*,
      1 - (eligible.profile_embedding <=> p_profile_embedding) as similarity
    from eligible
    order by eligible.profile_embedding <=> p_profile_embedding, eligible.unitid, eligible.outcome_id
    limit (select match_count from params)
  ),
  grouped as (
    select
      ranked.unitid,
      ranked.school_name,
      count(distinct ranked.subject_id)::integer as cohort_size,
      count(distinct ranked.subject_id) filter (where ranked.outcome = 'admitted')::integer as admitted_count,
      count(distinct ranked.subject_id) filter (where ranked.outcome = 'denied')::integer as denied_count,
      count(distinct ranked.subject_id) filter (where ranked.outcome = 'waitlisted')::integer as waitlisted_count,
      count(distinct ranked.subject_id) filter (where ranked.outcome = 'deferred')::integer as deferred_count,
      min(ranked.similarity)::double precision as similarity_min,
      max(ranked.similarity)::double precision as similarity_max
    from ranked
    group by ranked.unitid, ranked.school_name
    having count(distinct ranked.subject_id) >= (select k from params)
  )
  select
    grouped.unitid,
    grouped.school_name,
    grouped.cohort_size,
    grouped.admitted_count,
    grouped.denied_count,
    grouped.waitlisted_count,
    grouped.deferred_count,
    round(grouped.admitted_count::numeric / grouped.cohort_size, 4) as admit_rate,
    round(grouped.denied_count::numeric / grouped.cohort_size, 4) as denied_rate,
    round(grouped.waitlisted_count::numeric / grouped.cohort_size, 4) as waitlisted_rate,
    round(grouped.deferred_count::numeric / grouped.cohort_size, 4) as deferred_rate,
    grouped.similarity_min,
    grouped.similarity_max,
    coalesce(cards.attribute_cards, '[]'::jsonb) as attribute_cards,
    coalesce(insights.admit_insights, '[]'::jsonb) as admit_insights,
    jsonb_build_object(
      'curated_public',
      (
        select count(distinct r.subject_id)
        from ranked r
        where r.unitid = grouped.unitid
          and r.outcome_provenance = 'curated_public'
      ),
      'consented_user',
      (
        select count(distinct r.subject_id)
        from ranked r
        where r.unitid = grouped.unitid
          and r.outcome_provenance = 'consented_user'
      ),
      'source_urls',
      (
        select coalesce(jsonb_agg(source_url order by source_url), '[]'::jsonb)
        from (
          select distinct r.source_url
          from ranked r
          where r.unitid = grouped.unitid
            and r.source_url is not null
        ) sources
      )
    ) as provenance
  from grouped
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'kind', card.kind,
          'label', card.label,
          'value', card.value,
          'count', card.subject_count
        )
        order by card.kind, card.subject_count desc, card.value
      ),
      '[]'::jsonb
    ) as attribute_cards
    from (
      select 'gpa' as kind, 'GPA band' as label, public.admira_gpa_band(r.gpa) as value,
        count(distinct r.subject_id)::integer as subject_count
      from ranked r
      where r.unitid = grouped.unitid
      group by 1, 2, 3
      having count(distinct r.subject_id) >= (select k from params)
      union all
      select 'test' as kind, 'Test band' as label,
        public.admira_test_band(r.sat_score, r.act_score, r.test_submitted) as value,
        count(distinct r.subject_id)::integer as subject_count
      from ranked r
      where r.unitid = grouped.unitid
      group by 1, 2, 3
      having count(distinct r.subject_id) >= (select k from params)
      union all
      select 'rigor' as kind, 'Course rigor' as label,
        public.admira_label_or_unknown(r.course_rigor, 'Rigor not reported') as value,
        count(distinct r.subject_id)::integer as subject_count
      from ranked r
      where r.unitid = grouped.unitid
      group by 1, 2, 3
      having count(distinct r.subject_id) >= (select k from params)
      union all
      select 'activities' as kind, 'Activities' as label,
        public.admira_label_or_unknown(r.activities_tier, 'Activities not reported') as value,
        count(distinct r.subject_id)::integer as subject_count
      from ranked r
      where r.unitid = grouped.unitid
      group by 1, 2, 3
      having count(distinct r.subject_id) >= (select k from params)
    ) card
  ) cards on true
  left join lateral (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label', insight.label,
          'value', insight.value,
          'count', insight.subject_count
        )
        order by insight.subject_count desc, insight.label, insight.value
      ),
      '[]'::jsonb
    ) as admit_insights
    from (
      select 'Admitted GPA band' as label, public.admira_gpa_band(r.gpa) as value,
        count(distinct r.subject_id)::integer as subject_count
      from ranked r
      where r.unitid = grouped.unitid
        and r.outcome = 'admitted'
      group by 1, 2
      having count(distinct r.subject_id) >= (select k from params)
      union all
      select 'Admitted test band' as label,
        public.admira_test_band(r.sat_score, r.act_score, r.test_submitted) as value,
        count(distinct r.subject_id)::integer as subject_count
      from ranked r
      where r.unitid = grouped.unitid
        and r.outcome = 'admitted'
      group by 1, 2
      having count(distinct r.subject_id) >= (select k from params)
      union all
      select 'Admitted rigor' as label,
        public.admira_label_or_unknown(r.course_rigor, 'Rigor not reported') as value,
        count(distinct r.subject_id)::integer as subject_count
      from ranked r
      where r.unitid = grouped.unitid
        and r.outcome = 'admitted'
      group by 1, 2
      having count(distinct r.subject_id) >= (select k from params)
      union all
      select 'Admitted activities' as label,
        public.admira_label_or_unknown(r.activities_tier, 'Activities not reported') as value,
        count(distinct r.subject_id)::integer as subject_count
      from ranked r
      where r.unitid = grouped.unitid
        and r.outcome = 'admitted'
      group by 1, 2
      having count(distinct r.subject_id) >= (select k from params)
    ) insight
  ) insights on true
  order by grouped.cohort_size desc, grouped.unitid;
$$;

revoke all on function public.match_similar_cohort(vector, integer, uuid, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.match_similar_cohort(vector, integer, uuid, integer, integer, integer)
  to service_role;
