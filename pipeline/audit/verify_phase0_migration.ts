import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const migrationsDir = join(root, "supabase", "migrations");
const auditDir = join(root, "pipeline", "audit");
const phase0Migration = "202606260001_v2_phase0_canada_foundations.sql";
const prePhase0Migrations = [
  "202606150001_create_schools.sql",
  "202606170001_phase6_outcome_capture.sql",
  "202606180001_fit_finder_phase1.sql",
  "202606180002_fit_finder_phase2_match_function.sql",
  "202606190001_fit_finder_phase3_programs_filters.sql",
];

function read(relativePath: string) {
  return readFileSync(relativePath, "utf8");
}

function sqlComment(label: string) {
  return `\n-- verify_phase0_migration: ${label}\n`;
}

function buildSql() {
  const beforePhase0 = prePhase0Migrations
    .map((file) => sqlComment(file) + read(join(migrationsDir, file)))
    .join("\n");
  const phase0 = sqlComment(phase0Migration) + read(join(migrationsDir, phase0Migration));
  const check = sqlComment("v2_phase0_migration_check.sql") +
    read(join(auditDir, "v2_phase0_migration_check.sql"));
  const down = sqlComment("v2_phase0_canada_foundations_down.sql") +
    read(join(auditDir, "v2_phase0_canada_foundations_down.sql"));

  return `
\\set ON_ERROR_STOP on
begin;

${beforePhase0}

insert into public.schools (
  unitid,
  name,
  state,
  setting,
  size,
  admit_rate,
  test_policy,
  c7_factors,
  selectivity_tier
) values (
  -260001,
  'Admira Phase 0 Existing US Harness',
  'TS',
  'city',
  1,
  0.5,
  'unknown',
  '{}'::jsonb,
  'accessible'
);

${phase0}
${check}
${down}

do $$
begin
  if to_regclass('public.program_requirements') is not null then
    raise exception 'program_requirements was not dropped by the down path';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'schools'
      and column_name in (
        'country',
        'province_state',
        'admission_system',
        'grading_basis',
        'broad_based_admission',
        'merit_auto'
      )
  ) then
    raise exception 'Phase 0 schools columns remain after down path';
  end if;
end $$;

rollback;
`;
}

const databaseUrl = process.env.ADMIRA_PHASE0_DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "Missing ADMIRA_PHASE0_DATABASE_URL. Point it at a disposable Postgres database with pgvector available.",
  );
}

execFileSync("psql", [databaseUrl, "-X"], {
  input: buildSql(),
  stdio: ["pipe", "inherit", "inherit"],
});

console.log("V2 Phase 0 migration apply/check/down verification passed.");
