# Phase 4 Money Sources

This seed is intentionally curated and deterministic. It is not a scraper output.
Rows may only be added when the published amount can be traced to an HTTPS
source and the row declares `verified` or `estimate`.

## US Net Price And Earnings

- College Scorecard data page and API, updated June 10, 2026:
  https://collegescorecard.ed.gov/data/
- Seeded fields: latest cost attendance, average net price by income band, and
  median earnings 10 years after entry for the launch US schools.

### Breadth expansion (2026-07-01)

- Added full six-band net-price coverage for the 100 most-searched US schools
  (ordered by the curated prominence list in
  `pipeline/data/schools_public_cache.csv`), pulled directly from the College
  Scorecard API (`api.data.gov/ed/collegescorecard/v1/schools`) on 2026-07-01
  with the project `SCORECARD_API_KEY`. These rows carry
  `source_year: "scorecard-latest-2026-07-01"`.
- Field mapping per school:
  - `sticker_price` = `latest.cost.attendance.academic_year`
  - `net_price` (`overall`) = `latest.cost.avg_net_price.{public|private}`
  - `net_price` (income bands) =
    `latest.cost.net_price.{public|private}.by_income_level.{band}`
  - `median_earnings_10yr` = `latest.earnings.10_yrs_after_entry.median`
  - Public vs private field family is chosen by `school.ownership`
    (1 = public, 2 = private nonprofit).
- Schools with any null required field were skipped rather than filled in — no
  value is invented. Skipped in the searched set: the three federal service
  academies and one conservatory (no reported net price), and two for-profit
  institutions. The five US schools already in the launch corpus (unitids
  100751, 104151, 104179, 153603, 229115) were left unchanged.
- Below-zero handling: for a few high-aid privates the Scorecard net price for
  the lowest income band(s) is negative (average grant aid exceeds cost of
  attendance). Those cells are floored to the model minimum of 0 and marked
  `basis: "estimate"` with a per-row `notes` field recording the original
  Scorecard value; every other band for those schools stays `verified`.
  Affected: University of Pennsylvania, University of Chicago, Stanford
  University, Brown University, Duke University, Johns Hopkins University, MIT,
  Williams College, and California Institute of Technology.

## US Merit Expansion Note (2026-07-01)

The net-price breadth pass did not add new automatic-merit rules. Candidate
formulaic-merit publics were checked against their published award pages
(University of Arizona, University of Tennessee–Knoxville, Mississippi State
University, University of Mississippi, University of Alabama at Birmingham, and
University of Ottawa via OUInfo). Each either now publishes an award *range*
rather than a cell-by-cell GPA/test → amount grid, or renders its grid
client-side with no stable machine-readable table to cite. Following the rule
that a merit rule is added only where the school publishes an actual table with
a stable source URL, none were added; those schools carry their net-price band
alone. The existing verified merit tables (University of Alabama, Texas Tech,
and the Canadian entrance-scholarship schools below) are unchanged.

## US Merit

- University of Alabama automatic out-of-state freshman scholarships:
  https://afford.ua.edu/scholarships/out-of-state-freshman/
- Texas Tech University Presidential Merit scholarships:
  https://www.depts.ttu.edu/scholarships/incFreshman.php

## Canada Tuition, Merit, And Earnings

Canadian institutions have no IPEDS unitid, so they use a negative-sentinel
unitid scheme. Current mapping (no new Canadian schools were added in the
2026-07-01 breadth pass):

| unitid  | school                            |
| ------- | --------------------------------- |
| -124001 | University of Waterloo            |
| -124003 | University of Toronto Mississauga |
| -124007 | Western University                |
| -124008 | University of Guelph              |
| -124011 | Carleton University               |

New Canadian schools should continue the pattern with the next unused
`-1240xx` sentinel and record it here.


- University of Waterloo first-year tuition estimates:
  https://uwaterloo.ca/future-students/financing/tuition
- University of Waterloo entrance scholarships:
  https://uwaterloo.ca/future-students/financing/scholarships
- University of Toronto Mississauga tuition and fees:
  https://www.utm.utoronto.ca/future-students/finances/tuition-fees
- University of Toronto Mississauga entrance scholarships:
  https://www.utm.utoronto.ca/future-students/finances-affordability/entrance-scholarships
- University of Guelph undergraduate funding:
  https://www.uoguelph.ca/admission/undergraduate/funding/
- University of Guelph tuition and fees:
  https://www.uoguelph.ca/registrar/finances-fees/tuition-fees/guelph-undergrad/F25-W26-S26
- Western University admission scholarship program:
  https://registrar.uwo.ca/student_finances/scholarships_awards/admission/western_admission_scholarship_program.html
- Western University per-course undergraduate Canadian fee schedule:
  https://www.registrar.uwo.ca/student_finances/fees_refunds/2025-FW-UGRD-PTPC-Fee-Schedule-CDN.pdf
- Carleton University entrance scholarships via OUInfo:
  https://www.ouinfo.ca/universities/carleton/scholarships
- Carleton University Ontario undergraduate tuition fees:
  https://carleton.ca/studentaccounts/tuition-fees/fw-ug/f25w26-ug-ontario/
- Government of Canada Job Bank Computer Science bachelor's graduate earnings:
  https://www.jobbank.gc.ca/career-planning/school-work-transition/11.0701/LOS05

## Modeling Notes

- US net-price rows are `verified` Scorecard figures.
- Canada tuition rows are marked `estimate` when the source says fees are
  estimates, guidelines, or subject to change.
- Canada ROI uses the national Computer Science bachelor's 10-year median
  earnings from Job Bank as a sourced field-level proxy, so ROI outputs remain
  `estimate`.
- The final net-price formula is `max(0, sticker - need_aid - merit)`. Need aid
  is split conservatively from the baseline net-price row after merit so average
  aid and automatic merit are not double-counted.
