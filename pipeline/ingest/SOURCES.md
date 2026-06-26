# Canada Phase 0 Sources

Retrieved: 2026-06-26

This ingest is deterministic. `pipeline/ingest/ingest_canada_seed.py` reads the committed fixture at `pipeline/data/canada_phase0_seed.json`; it does not scrape live pages during a build or audit run.

## Core Program Sources

- OUInfo program pages are used for Ontario program names, OUAC systems, grade ranges, prerequisites, and supplemental-application flags. OUInfo states that its information is valid for Ontario high school students entering the 2026 application cycle.
- University of Waterloo Engineering admission requirements are used for engineering program-level competitive averages and AIF/interview broad-based flags.
- McGill Ontario applicant requirements are used for prior-year Ontario cutoffs and prerequisites.
- UBC application evaluation pages are used for broad-based admission and Personal Profile flags.

## Source URLs

- https://www.ouinfo.ca/programs/waterloo/wcs
- https://uwaterloo.ca/engineering/future-students/applying/admission-requirements
- https://uwaterloo.ca/future-students/admissions/admission-information-form
- https://www.ouinfo.ca/programs/toronto-scarborough/txc
- https://www.ouinfo.ca/programs/toronto-mississauga/tmx
- https://www.ouinfo.ca/programs/toronto-st-george/tad
- https://www.ouinfo.ca/programs/toronto-st-george/tac
- https://www.ouinfo.ca/programs/mcmaster/mec
- https://www.ouinfo.ca/programs/mcmaster/mb
- https://www.ouinfo.ca/programs/mcmaster/mc
- https://www.ouinfo.ca/programs/queens/qc
- https://www.ouinfo.ca/programs/western/ecs
- https://www.ouinfo.ca/programs/western/ee
- https://www.ouinfo.ca/programs/guelph/gct
- https://www.ouinfo.ca/programs/guelph/gbf
- https://www.ouinfo.ca/programs/toronto-metropolitan/sab
- https://www.ouinfo.ca/programs/laurier-waterloo/uzg
- https://www.ouinfo.ca/programs/carleton/cc
- https://www.ouinfo.ca/programs/york/yfb
- https://www.mcgill.ca/undergraduate-admissions/apply/requirements/ontario
- https://www.mcgill.ca/studentaid/scholarships-aid/future-undergrads/entrance-scholarships/criteria
- https://you.ubc.ca/applying-ubc/application-evaluation/
- https://future.utoronto.ca/admission-awards
- https://uwaterloo.ca/math/undergraduate-studies/applying/scholarships

## Lineage Rules

- Every school fixture row has `source_url`; the ingest stores it in `schools.c7_factors._source`.
- Every program fixture row has `source_url`; the ingest writes it directly to `program_requirements.source_url`.
- `ingested_at` is fixed by default to `2026-06-26T00:00:00+00:00` for reproducible dry-runs and seed upserts.
