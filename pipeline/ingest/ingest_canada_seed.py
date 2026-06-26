"""Deterministic Canada Phase 0 ingest.

This script intentionally reads a committed fixture instead of scraping live
pages. It validates lineage, normalizes rows for the current Supabase schema,
and can optionally upsert through the service-role Supabase client.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

try:
    from supabase import create_client
except ImportError:  # pragma: no cover - only needed for --write-supabase
    create_client = None


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SEED_PATH = ROOT / "pipeline" / "data" / "canada_phase0_seed.json"
DEFAULT_INGESTED_AT = "2026-06-26T00:00:00+00:00"

SCHOOL_COLUMNS = {
    "unitid",
    "name",
    "state",
    "setting",
    "size",
    "admit_rate",
    "sat_25",
    "sat_75",
    "act_25",
    "act_75",
    "gpa_avg",
    "test_policy",
    "ed_admit_rate",
    "rd_admit_rate",
    "c7_factors",
    "selectivity_tier",
    "program_areas",
    "programs",
    "size_band",
    "region",
    "net_price_avg",
    "sticker_cost",
    "median_earnings_10yr",
    "completion_rate",
    "control",
    "country",
    "province_state",
    "admission_system",
    "grading_basis",
    "broad_based_admission",
    "merit_auto",
    "updated_at",
}

PROGRAM_COLUMNS = {
    "id",
    "unitid",
    "program_name",
    "system",
    "cutoff_avg_low",
    "cutoff_avg_high",
    "cutoff_basis",
    "prerequisites",
    "test_policy",
    "supplemental_app",
    "broad_based_admission",
    "source_url",
    "ingested_at",
}


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing {name}")
    return value


def load_seed(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data.get("schools"), list):
        raise ValueError("Seed must include a schools array")
    if not isinstance(data.get("program_requirements"), list):
        raise ValueError("Seed must include a program_requirements array")
    return data


def validate_source_url(row: dict[str, Any], label: str) -> None:
    source_url = row.get("source_url")
    if not isinstance(source_url, str) or not source_url.startswith(("http://", "https://")):
        raise ValueError(f"{label} must include an http(s) source_url")


def validate_seed(data: dict[str, Any]) -> None:
    school_ids = set()
    for school in data["schools"]:
        validate_source_url(school, f"school {school.get('name')}")
        if school.get("country", "CA") != "CA":
            raise ValueError(f"school {school.get('name')} must be a CA row")
        if not school.get("province_state"):
            raise ValueError(f"school {school.get('name')} is missing province_state")
        school_ids.add(school["unitid"])

    program_ids = set()
    for program in data["program_requirements"]:
        validate_source_url(program, f"program {program.get('program_name')}")
        if program["unitid"] not in school_ids:
            raise ValueError(
                f"program {program.get('program_name')} references missing school {program['unitid']}"
            )
        if program["id"] in program_ids:
            raise ValueError(f"duplicate program id {program['id']}")
        program_ids.add(program["id"])


def normalized_school(row: dict[str, Any], ingested_at: str) -> dict[str, Any]:
    source_url = row["source_url"]
    c7_factors = row.get("c7_factors") or {}
    c7_factors.setdefault("_source", source_url)
    c7_factors.setdefault("lineage", "pipeline/data/canada_phase0_seed.json")

    normalized = {
        "unitid": row["unitid"],
        "name": row["name"],
        "state": row.get("state"),
        "setting": row.get("setting"),
        "size": row.get("size"),
        "admit_rate": row.get("admit_rate"),
        "sat_25": row.get("sat_25"),
        "sat_75": row.get("sat_75"),
        "act_25": row.get("act_25"),
        "act_75": row.get("act_75"),
        "gpa_avg": row.get("gpa_avg"),
        "test_policy": row.get("test_policy", "unknown"),
        "ed_admit_rate": row.get("ed_admit_rate"),
        "rd_admit_rate": row.get("rd_admit_rate"),
        "c7_factors": c7_factors,
        "selectivity_tier": row.get("selectivity_tier"),
        "program_areas": row.get("program_areas"),
        "programs": row.get("programs"),
        "size_band": row.get("size_band"),
        "region": row.get("region"),
        "net_price_avg": row.get("net_price_avg"),
        "sticker_cost": row.get("sticker_cost"),
        "median_earnings_10yr": row.get("median_earnings_10yr"),
        "completion_rate": row.get("completion_rate"),
        "control": row.get("control"),
        "country": "CA",
        "province_state": row["province_state"],
        "admission_system": row.get("admission_system"),
        "grading_basis": row.get("grading_basis", "percentage"),
        "broad_based_admission": row.get("broad_based_admission", False),
        "merit_auto": row.get("merit_auto"),
        "updated_at": ingested_at,
    }
    return {key: value for key, value in normalized.items() if key in SCHOOL_COLUMNS}


def normalized_program(row: dict[str, Any], ingested_at: str) -> dict[str, Any]:
    normalized = {
        "id": row["id"],
        "unitid": row["unitid"],
        "program_name": row["program_name"],
        "system": row.get("system"),
        "cutoff_avg_low": row.get("cutoff_avg_low"),
        "cutoff_avg_high": row.get("cutoff_avg_high"),
        "cutoff_basis": row.get("cutoff_basis"),
        "prerequisites": row.get("prerequisites"),
        "test_policy": row.get("test_policy", "unknown"),
        "supplemental_app": row.get("supplemental_app", False),
        "broad_based_admission": row.get("broad_based_admission", False),
        "source_url": row["source_url"],
        "ingested_at": ingested_at,
    }
    return {key: value for key, value in normalized.items() if key in PROGRAM_COLUMNS}


def build_payload(data: dict[str, Any], ingested_at: str) -> dict[str, Any]:
    validate_seed(data)
    schools = [normalized_school(row, ingested_at) for row in data["schools"]]
    programs = [
        normalized_program(row, ingested_at)
        for row in data["program_requirements"]
    ]
    return {
        "meta": {
            **data.get("_meta", {}),
            "ingested_at": ingested_at,
            "source_fixture": str(DEFAULT_SEED_PATH.relative_to(ROOT)),
        },
        "schools": schools,
        "program_requirements": programs,
    }


def write_supabase(payload: dict[str, Any]) -> None:
    if create_client is None:
        raise RuntimeError("supabase is not installed; install pipeline requirements first")

    supabase_url = require_env("SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    client = create_client(supabase_url, service_role_key)

    client.table("schools").upsert(
        payload["schools"],
        on_conflict="unitid",
    ).execute()
    client.table("program_requirements").upsert(
        payload["program_requirements"],
        on_conflict="id",
    ).execute()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--seed",
        type=Path,
        default=DEFAULT_SEED_PATH,
        help="Path to committed Canada seed JSON.",
    )
    parser.add_argument(
        "--ingested-at",
        default=DEFAULT_INGESTED_AT,
        help="Fixed timestamptz used for deterministic program rows.",
    )
    parser.add_argument(
        "--write-supabase",
        action="store_true",
        help="Upsert into Supabase using SUPABASE_SERVICE_ROLE_KEY.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional file path for normalized dry-run JSON.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data = load_seed(args.seed)
    payload = build_payload(data, args.ingested_at)

    if args.write_supabase:
        write_supabase(payload)
        print(
            f"Upserted {len(payload['schools'])} schools and "
            f"{len(payload['program_requirements'])} program requirements."
        )
        return 0

    rendered = json.dumps(payload, indent=2, sort_keys=True)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        sys.stdout.write(rendered + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
