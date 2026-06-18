from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

from fit_embedding_model import EMBEDDING_DIM, EMBEDDING_MODEL_ID
from ingest_scorecard import require_env


ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT / "pipeline" / "reports" / "embedding_sanity.md"

SANITY_SCHOOLS = {
    "MIT": 166683,
    "Georgia Tech": 139755,
    "Michigan": 170976,
    "Williams": 168342,
    "Amherst": 164465,
    "Alabama": 100751,
    "Wisconsin": 240444,
}

SANITY_PAIRS = [
    ("Georgia Tech", "Michigan", "large public research pair"),
    ("Williams", "Amherst", "liberal arts pair"),
    ("MIT", "Georgia Tech", "technical research pair"),
    ("MIT", "Alabama", "cross-profile comparison"),
    ("Wisconsin", "Alabama", "large public comparison"),
]


def parse_embedding(value: Any) -> list[float]:
    if isinstance(value, list):
        vector = [float(item) for item in value]
    elif isinstance(value, str):
        cleaned = value.strip().strip("[]")
        vector = [float(item) for item in cleaned.split(",") if item.strip()]
    else:
        raise ValueError(f"Unexpected embedding value: {type(value).__name__}")

    if len(vector) != EMBEDDING_DIM:
        raise ValueError(f"Embedding has {len(vector)} dimensions, expected {EMBEDDING_DIM}")

    return vector


def cosine_similarity(left: list[float], right: list[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right, strict=True))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        raise ValueError("Cannot compare a zero-length embedding")
    return numerator / (left_norm * right_norm)


def fetch_embeddings() -> dict[str, dict[str, Any]]:
    supabase_url = require_env("SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, service_role_key)
    unitids = list(SANITY_SCHOOLS.values())
    response = (
        supabase.table("schools")
        .select("unitid,name,embedding")
        .in_("unitid", unitids)
        .execute()
    )

    rows_by_unitid = {int(row["unitid"]): row for row in response.data or []}
    records: dict[str, dict[str, Any]] = {}
    for label, unitid in SANITY_SCHOOLS.items():
        row = rows_by_unitid.get(unitid)
        if not row or row.get("embedding") is None:
            continue
        records[label] = {
            "unitid": unitid,
            "name": row["name"],
            "embedding": parse_embedding(row["embedding"]),
        }

    return records


def build_report(records: dict[str, dict[str, Any]]) -> tuple[str, bool]:
    lines = [
        "# Fit Finder Embedding Sanity Report",
        "",
        f"Model: `{EMBEDDING_MODEL_ID}`",
        f"Dimensions: `{EMBEDDING_DIM}`",
        "",
        "This report compares stored school vectors for a few known pairs.",
        "",
        "| Pair | Reason | Cosine similarity |",
        "| --- | --- | --- |",
    ]
    ok = True

    for left_label, right_label, reason in SANITY_PAIRS:
        left = records.get(left_label)
        right = records.get(right_label)
        if not left or not right:
            ok = False
            lines.append(f"| {left_label} to {right_label} | {reason} | missing |")
            continue

        similarity = cosine_similarity(left["embedding"], right["embedding"])
        lines.append(
            f"| {left['name']} to {right['name']} | {reason} | {similarity:.4f} |"
        )

    lines.extend(
        [
            "",
            "Expected read: similar institutional profiles should generally score higher than cross-profile comparisons.",
            "This is a sanity check, not a quality claim.",
            "",
        ]
    )
    return "\n".join(lines), ok


def main() -> None:
    load_dotenv()
    records = fetch_embeddings()
    report, ok = build_report(records)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(report)
    print(f"Wrote {REPORT_PATH}")

    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
