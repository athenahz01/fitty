# Phase 4 Money Sources

This seed is intentionally curated and deterministic. It is not a scraper output.
Rows may only be added when the published amount can be traced to an HTTPS
source and the row declares `verified` or `estimate`.

## US Net Price And Earnings

- College Scorecard data page and API, updated June 10, 2026:
  https://collegescorecard.ed.gov/data/
- Seeded fields: latest cost attendance, average net price by income band, and
  median earnings 10 years after entry for the launch US schools.

## US Merit

- University of Alabama automatic out-of-state freshman scholarships:
  https://afford.ua.edu/scholarships/out-of-state-freshman/
- Texas Tech University Presidential Merit scholarships:
  https://www.depts.ttu.edu/scholarships/incFreshman.php

## Canada Tuition, Merit, And Earnings

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
