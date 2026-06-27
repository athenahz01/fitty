# Students-Like-You Seed Sources

`students_like_you_seed.json` contains deterministic launch archetypes, not real user records. Each row is tagged `provenance: "curated_public"` and carries a `source_url`. The profile values are broad archetypes derived from public aggregate admissions ranges so the Phase 3 UI can exercise k-anonymous cohorts before enough real consented records exist.

Sources:

- MIT Admissions statistics: https://mitadmissions.org/apply/process/stats/
- MIT Institutional Research 2024-25 Common Data Set: https://ir.mit.edu/projects/2024-25-common-data-set/
- University of Michigan Common Data Set page: https://obp.umich.edu/campus-statistics/common-data-set/
- University of Michigan 2024-25 Common Data Set PDF: https://obp.umich.edu/wp-content/uploads/pubdata/cds/CDS_2024-25_UMAA.pdf
- University of Alabama 2024-25 Common Data Set PDF: https://oira.ua.edu/d/sites/all/files/reports25/CDS%202024-25%20FINAL.pdf

Real outcome-capture rows use the default `provenance: "consented_user"` and do not require a `source_url`; they are admitted to cohorts only while active modeling consent remains unrevoked.

# Phase 6 — Essay-pattern corpus & Compass data

`essay_pattern_corpus.json` contains qualitative essay-CRAFT patterns (not real student essays, no PII, no numbers), each tagged `provenance: "curated_public"` with a `source_url` to public admissions-writing guidance. The Narrative engine retrieves the closest patterns to ground feedback and references them; it never reproduces or drafts essay prose. Sources are the published admissions/writing pages cited in each row (MIT, Princeton, Harvard, Yale, Common App).

`compass_seed.json` holds the Major/Career Compass reference data loaded by `npm run ingest:compass` into `compass_majors` / `compass_careers`. Earnings figures are NOT fabricated: the operator populates rows from College Scorecard field-of-study earnings and an O*NET/BLS-style career dataset, each row carrying a verifiable `source_url`. Until the dataset is loaded the seed ships empty and the Compass labels earnings as pending rather than inventing a number. The loader (`ingest_compass_seed.ts`) refuses any row missing a `source_url`.
