from __future__ import annotations

import os
import time
from collections import Counter
from datetime import UTC, datetime
from typing import Any

import requests
from dotenv import load_dotenv
from supabase import create_client

from ingest_scorecard import (
    chunked,
    integer_or_none,
    load_seed_entries,
    numeric_or_none,
    require_env,
    scorecard_get,
)


PROGRAM_AREA_FIELDS = [
    ("agriculture", "Agriculture", "latest.academics.program_percentage.agriculture"),
    ("resources", "Natural resources", "latest.academics.program_percentage.resources"),
    ("architecture", "Architecture", "latest.academics.program_percentage.architecture"),
    ("communication", "Communication", "latest.academics.program_percentage.communication"),
    (
        "communications_technology",
        "Communications technology",
        "latest.academics.program_percentage.communications_technology",
    ),
    ("computer", "Computer and information sciences", "latest.academics.program_percentage.computer"),
    ("personal_culinary", "Personal and culinary services", "latest.academics.program_percentage.personal_culinary"),
    ("education", "Education", "latest.academics.program_percentage.education"),
    ("engineering", "Engineering", "latest.academics.program_percentage.engineering"),
    (
        "engineering_technology",
        "Engineering technology",
        "latest.academics.program_percentage.engineering_technology",
    ),
    ("language", "Languages", "latest.academics.program_percentage.language"),
    (
        "family_consumer_science",
        "Family and consumer sciences",
        "latest.academics.program_percentage.family_consumer_science",
    ),
    ("legal", "Legal studies", "latest.academics.program_percentage.legal"),
    ("english", "English", "latest.academics.program_percentage.english"),
    ("humanities", "Liberal arts and humanities", "latest.academics.program_percentage.humanities"),
    ("library", "Library science", "latest.academics.program_percentage.library"),
    ("biological", "Biological sciences", "latest.academics.program_percentage.biological"),
    ("mathematics", "Mathematics", "latest.academics.program_percentage.mathematics"),
    ("military", "Military technologies", "latest.academics.program_percentage.military"),
    ("multidiscipline", "Multidisciplinary studies", "latest.academics.program_percentage.multidiscipline"),
    (
        "parks_recreation_fitness",
        "Parks, recreation, and fitness",
        "latest.academics.program_percentage.parks_recreation_fitness",
    ),
    (
        "philosophy_religious",
        "Philosophy and religious studies",
        "latest.academics.program_percentage.philosophy_religious",
    ),
    (
        "theology_religious_vocation",
        "Theology and religious vocations",
        "latest.academics.program_percentage.theology_religious_vocation",
    ),
    ("physical_science", "Physical sciences", "latest.academics.program_percentage.physical_science"),
    ("science_technology", "Science technologies", "latest.academics.program_percentage.science_technology"),
    ("psychology", "Psychology", "latest.academics.program_percentage.psychology"),
    (
        "security_law_enforcement",
        "Security and law enforcement",
        "latest.academics.program_percentage.security_law_enforcement",
    ),
    (
        "public_administration_social_service",
        "Public administration and social service",
        "latest.academics.program_percentage.public_administration_social_service",
    ),
    ("social_science", "Social sciences", "latest.academics.program_percentage.social_science"),
    ("construction", "Construction trades", "latest.academics.program_percentage.construction"),
    (
        "mechanic_repair_technology",
        "Mechanic and repair technology",
        "latest.academics.program_percentage.mechanic_repair_technology",
    ),
    ("precision_production", "Precision production", "latest.academics.program_percentage.precision_production"),
    ("transportation", "Transportation", "latest.academics.program_percentage.transportation"),
    (
        "visual_performing",
        "Visual and performing arts",
        "latest.academics.program_percentage.visual_performing",
    ),
    ("health", "Health professions", "latest.academics.program_percentage.health"),
    ("business_marketing", "Business and marketing", "latest.academics.program_percentage.business_marketing"),
    ("history", "History", "latest.academics.program_percentage.history"),
]

SCORECARD_FIELDS = [
    "id",
    "school.name",
    "school.state",
    "school.ownership",
    "latest.student.size",
    "latest.cost.avg_net_price.overall",
    "latest.cost.attendance.academic_year",
    "latest.earnings.10_yrs_after_entry.median",
    "latest.completion.rate_suppressed.overall",
    "latest.completion.completion_rate_4yr_150nt",
    # Specific field-of-study titles (4-digit CIP) plus their credential level,
    # returned by Scorecard as parallel arrays. These give Fit Finder real
    # program names like "Public Policy Analysis" instead of broad buckets.
    "latest.programs.cip_4_digit.title",
    "latest.programs.cip_4_digit.credential.level",
    *[field for _, _, field in PROGRAM_AREA_FIELDS],
]

# Scorecard credential.level codes worth keeping for undergraduate program fit.
# 2 = associate, 3 = bachelor's. Graduate-only credentials are dropped so the
# program list reflects what an applying undergraduate can study.
UNDERGRAD_CREDENTIAL_LEVELS = {2, 3}
MAX_SPECIFIC_PROGRAMS = 24

NORTHEAST_STATES = {"CT", "ME", "MA", "NH", "NJ", "NY", "PA", "RI", "VT"}
MIDWEST_STATES = {"IL", "IN", "IA", "KS", "MI", "MN", "MO", "NE", "ND", "OH", "SD", "WI"}
SOUTH_STATES = {
    "AL",
    "AR",
    "DC",
    "DE",
    "FL",
    "GA",
    "KY",
    "LA",
    "MD",
    "MS",
    "NC",
    "OK",
    "SC",
    "TN",
    "TX",
    "VA",
    "WV",
}
WEST_STATES = {
    "AK",
    "AZ",
    "CA",
    "CO",
    "HI",
    "ID",
    "MT",
    "NM",
    "NV",
    "OR",
    "UT",
    "WA",
    "WY",
}


def state_region(state: Any) -> str | None:
    if not isinstance(state, str):
        return None
    normalized = state.strip().upper()
    if normalized in NORTHEAST_STATES:
        return "Northeast"
    if normalized in MIDWEST_STATES:
        return "Midwest"
    if normalized in SOUTH_STATES:
        return "South"
    if normalized in WEST_STATES:
        return "West"
    return None


def size_band(size: Any) -> str | None:
    undergraduate_count = integer_or_none(size)
    if undergraduate_count is None:
        return None
    if undergraduate_count < 3000:
        return "small"
    if undergraduate_count <= 10000:
        return "medium"
    return "large"


def top_program_areas(row: dict[str, Any], limit: int = 6) -> list[str] | None:
    areas: list[tuple[float, str]] = []
    for _, label, field in PROGRAM_AREA_FIELDS:
        share = numeric_or_none(row.get(field))
        if share is not None and share > 0:
            areas.append((share, label))

    if not areas:
        return None

    areas.sort(key=lambda item: (-item[0], item[1]))
    return [label for _, label in areas[:limit]]


def completion_rate(row: dict[str, Any]) -> float | None:
    suppressed_rate = numeric_or_none(row.get("latest.completion.rate_suppressed.overall"))
    if suppressed_rate is not None:
        return suppressed_rate
    return numeric_or_none(row.get("latest.completion.completion_rate_4yr_150nt"))


def _clean_title(value: Any) -> str | None:
    if value is None:
        return None
    text = " ".join(str(value).split()).strip()
    if not text:
        return None
    # Title-case ALLCAPS Scorecard titles while leaving normal casing intact.
    if text.isupper():
        text = text.title()
    return text


def specific_programs(row: dict[str, Any]) -> list[str] | None:
    """Deterministic list of specific undergraduate program titles for a school.

    Reads the parallel CIP 4-digit title and credential-level arrays, keeps
    undergraduate credentials, de-duplicates case-insensitively while preserving
    first-seen order, and caps the list so the embedded document stays bounded.
    """

    titles = row.get("latest.programs.cip_4_digit.title")
    if not isinstance(titles, list):
        return None

    levels = row.get("latest.programs.cip_4_digit.credential.level")
    if not isinstance(levels, list):
        levels = []

    seen: dict[str, str] = {}
    for index, raw_title in enumerate(titles):
        title = _clean_title(raw_title)
        if not title:
            continue
        level = integer_or_none(levels[index]) if index < len(levels) else None
        if level is not None and level not in UNDERGRAD_CREDENTIAL_LEVELS:
            continue
        key = title.lower()
        if key not in seen:
            seen[key] = title
        if len(seen) >= MAX_SPECIFIC_PROGRAMS:
            break

    if not seen:
        return None
    return list(seen.values())


def control_value(row: dict[str, Any]) -> str | None:
    ownership = integer_or_none(row.get("school.ownership"))
    if ownership == 1:
        return "public"
    if ownership in (2, 3):
        return "private"
    return None


def fetch_rows(api_key: str, unitids: list[int], throttle_seconds: float) -> list[dict[str, Any]]:
    session = requests.Session()
    rows: list[dict[str, Any]] = []

    for batch_number, batch in enumerate(chunked(unitids, 80), start=1):
        params = {
            "api_key": api_key,
            "id": ",".join(str(unitid) for unitid in batch),
            "per_page": 100,
            "_fields": ",".join(SCORECARD_FIELDS),
        }
        payload = scorecard_get(session, params)
        results = payload.get("results", [])
        rows.extend(results)
        print(f"Fetched enrichment batch {batch_number}: {len(results)} rows")
        time.sleep(throttle_seconds)
    return rows


def transform_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "unitid": int(row["id"]),
        "name": row.get("school.name") or "Unknown school",
        "program_areas": top_program_areas(row),
        "programs": specific_programs(row),
        "control": control_value(row),
        "size_band": size_band(row.get("latest.student.size")),
        "region": state_region(row.get("school.state")),
        "net_price_avg": numeric_or_none(row.get("latest.cost.avg_net_price.overall")),
        "sticker_cost": numeric_or_none(row.get("latest.cost.attendance.academic_year")),
        "median_earnings_10yr": numeric_or_none(
            row.get("latest.earnings.10_yrs_after_entry.median")
        ),
        "completion_rate": completion_rate(row),
        "updated_at": datetime.now(UTC).isoformat(),
    }


def upsert_rows(rows: list[dict[str, Any]]) -> None:
    supabase_url = require_env("SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, service_role_key)

    for batch in chunked(rows, 50):
        supabase.table("schools").upsert(batch, on_conflict="unitid").execute()
        print(f"Upserted enrichment for {len(batch)} schools")


def print_coverage(rows: list[dict[str, Any]], seed_count: int) -> None:
    fields = [
        "program_areas",
        "programs",
        "control",
        "size_band",
        "region",
        "net_price_avg",
        "sticker_cost",
        "median_earnings_10yr",
        "completion_rate",
    ]
    print("\nFit Finder enrichment coverage")
    print(f"Seeded schools: {seed_count}")
    print(f"Rows returned by Scorecard: {len(rows)}")

    for field in fields:
        present = sum(1 for row in rows if row.get(field) not in (None, []))
        missing = seed_count - present
        print(f"  {field}: present {present}, missing {missing}")

    region_counts = Counter(row.get("region") or "missing" for row in rows)
    print("Regions:")
    for region in ["Northeast", "Midwest", "South", "West", "missing"]:
        print(f"  {region}: {region_counts.get(region, 0)}")


def main() -> None:
    load_dotenv()
    seed_entries = load_seed_entries()
    unitids = [entry["unitid"] for entry in seed_entries]
    api_key = require_env("SCORECARD_API_KEY")
    throttle_seconds = float(os.getenv("SCORECARD_THROTTLE_SECONDS", "0.25"))

    print(f"Enriching {len(unitids)} seeded schools from public Scorecard fields")
    raw_rows = fetch_rows(api_key, unitids, throttle_seconds)
    rows = [transform_row(row) for row in raw_rows]
    upsert_rows(rows)
    print_coverage(rows, len(seed_entries))


if __name__ == "__main__":
    main()
