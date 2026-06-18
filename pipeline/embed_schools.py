from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from supabase import create_client

from fit_embedding_model import EMBEDDING_DIM, EMBEDDING_MODEL_ID
from fit_school_documents import FIT_FINDER_COLUMNS, build_school_document
from ingest_scorecard import chunked, load_seed_entries, require_env


ROOT = Path(__file__).resolve().parents[1]
XENOVA_HELPER_PATH = ROOT / "pipeline" / "embed_xenova.mjs"


def format_vector(values: list[float]) -> str:
    return "[" + ",".join(f"{value:.8f}" for value in values) + "]"


def fetch_school_rows(unitids: list[int]) -> list[dict[str, Any]]:
    supabase_url = require_env("SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, service_role_key)
    rows: list[dict[str, Any]] = []
    columns = ",".join(FIT_FINDER_COLUMNS)

    for batch in chunked(unitids, 50):
        response = (
            supabase.table("schools")
            .select(columns)
            .in_("unitid", batch)
            .execute()
        )
        rows.extend(response.data or [])

    return sorted(rows, key=lambda row: int(row["unitid"]))


def embed_documents(documents: list[str]) -> list[list[float]]:
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "input.json"
        output_path = temp_path / "output.json"
        input_path.write_text(
            json.dumps(
                {
                    "modelId": EMBEDDING_MODEL_ID,
                    "documents": documents,
                }
            ),
            encoding="utf-8",
        )

        result = subprocess.run(
            ["node", str(XENOVA_HELPER_PATH), str(input_path), str(output_path)],
            check=False,
            cwd=ROOT,
            text=True,
            capture_output=True,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "Xenova embedding helper failed\n"
                f"stdout:\n{result.stdout}\n"
                f"stderr:\n{result.stderr}"
            )

        payload = json.loads(output_path.read_text(encoding="utf-8"))
        vectors = payload.get("vectors")
        if not isinstance(vectors, list):
            raise ValueError("Xenova embedding helper did not return vectors")

        return [[float(value) for value in vector] for vector in vectors]


def upsert_embeddings(rows: list[dict[str, Any]], vectors: list[list[float]]) -> None:
    supabase_url = require_env("SUPABASE_URL")
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, service_role_key)
    now = datetime.now(UTC).isoformat()
    payloads = []

    for row, vector in zip(rows, vectors, strict=True):
        if len(vector) != EMBEDDING_DIM:
            raise ValueError(
                f"Embedding for unitid {row['unitid']} has {len(vector)} dimensions, "
                f"expected {EMBEDDING_DIM}"
            )

        payloads.append(
            {
                "unitid": int(row["unitid"]),
                "name": row["name"],
                "embedding": format_vector(vector),
                "updated_at": now,
            }
        )

    for batch in chunked(payloads, 25):
        supabase.table("schools").upsert(batch, on_conflict="unitid").execute()
        print(f"Upserted embeddings for {len(batch)} schools")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Embed deterministic Fit Finder school documents."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build documents and embeddings, but do not update Supabase.",
    )
    args = parser.parse_args()

    load_dotenv()
    seed_entries = load_seed_entries()
    unitids = [entry["unitid"] for entry in seed_entries]
    rows = fetch_school_rows(unitids)
    found_unitids = {int(row["unitid"]) for row in rows}
    missing_unitids = [unitid for unitid in unitids if unitid not in found_unitids]

    if missing_unitids:
        print(f"Missing {len(missing_unitids)} seeded schools in Supabase:")
        for unitid in missing_unitids:
            print(f"  {unitid}")

    if not rows:
        raise RuntimeError("No school rows found to embed")

    documents = [build_school_document(row) for row in rows]
    print(
        f"Embedding {len(documents)} school documents with {EMBEDDING_MODEL_ID} "
        f"at {EMBEDDING_DIM} dimensions"
    )
    vectors = embed_documents(documents)

    if args.dry_run:
        print("Dry run complete. No rows were updated.")
        return

    upsert_embeddings(rows, vectors)
    print(f"Embedded {len(vectors)} schools")


if __name__ == "__main__":
    main()
