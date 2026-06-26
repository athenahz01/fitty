do $$
declare
  invalid_insert_succeeded boolean := false;
  fk_insert_succeeded boolean := false;
  cutoff_insert_succeeded boolean := false;
begin
  if not exists (
    select 1
    from public.schools
    where unitid = -260001
      and country = 'US'
      and province_state = 'TS'
      and grading_basis = 'gpa_4_0'
      and broad_based_admission = false
  ) then
    raise exception 'existing US rows were not backfilled to US/gpa_4_0/province_state';
  end if;

  insert into public.schools (
    unitid,
    name,
    country,
    province_state,
    admission_system,
    grading_basis,
    broad_based_admission,
    test_policy,
    c7_factors
  ) values (
    -260002,
    'Admira Phase 0 Canada Harness',
    'CA',
    'ON',
    'ouac',
    'percentage',
    true,
    'unknown',
    '{"_source":"https://www.ouinfo.ca/"}'::jsonb
  );

  begin
    insert into public.schools (
      unitid,
      name,
      country,
      grading_basis,
      test_policy
    ) values (
      -260003,
      'Invalid Country Harness',
      'GB',
      'percentage',
      'unknown'
    );
    invalid_insert_succeeded := true;
  exception
    when check_violation then
      invalid_insert_succeeded := false;
  end;

  if invalid_insert_succeeded then
    raise exception 'invalid country insert unexpectedly succeeded';
  end if;

  insert into public.program_requirements (
    id,
    unitid,
    program_name,
    system,
    cutoff_avg_low,
    cutoff_avg_high,
    cutoff_basis,
    prerequisites,
    test_policy,
    supplemental_app,
    broad_based_admission,
    source_url,
    ingested_at
  ) values (
    '00000000-0000-4000-8000-000000260002',
    -260002,
    'Computer Science Harness',
    'ouac',
    90,
    95,
    'percentage',
    '["ENG4U","MHF4U","MCV4U"]'::jsonb,
    'unknown',
    true,
    true,
    'https://www.ouinfo.ca/programs/waterloo/wcs',
    '2026-06-26T00:00:00+00:00'
  );

  begin
    insert into public.program_requirements (
      unitid,
      program_name,
      source_url
    ) values (
      -999999,
      'Missing School Harness',
      'https://www.ouinfo.ca/'
    );
    fk_insert_succeeded := true;
  exception
    when foreign_key_violation then
      fk_insert_succeeded := false;
  end;

  if fk_insert_succeeded then
    raise exception 'program_requirements FK insert unexpectedly succeeded';
  end if;

  begin
    insert into public.program_requirements (
      unitid,
      program_name,
      cutoff_basis,
      source_url
    ) values (
      -260002,
      'Invalid Cutoff Basis Harness',
      'atar',
      'https://www.ouinfo.ca/'
    );
    cutoff_insert_succeeded := true;
  exception
    when check_violation then
      cutoff_insert_succeeded := false;
  end;

  if cutoff_insert_succeeded then
    raise exception 'invalid cutoff_basis insert unexpectedly succeeded';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.program_requirements'::regclass
      and relrowsecurity
  ) then
    raise exception 'program_requirements RLS is not enabled';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'program_requirements'
      and policyname = 'program requirements are public readable'
      and cmd = 'SELECT'
  ) then
    raise exception 'program_requirements public read policy is missing';
  end if;
end $$;
