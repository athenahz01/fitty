from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TS_CONSTANTS_PATH = ROOT / "lib" / "fit" / "embedding-model.ts"


def _read_ts_constants() -> tuple[str, int]:
    text = TS_CONSTANTS_PATH.read_text(encoding="utf-8")
    model_match = re.search(r'EMBEDDING_MODEL_ID\s*=\s*"([^"]+)"', text)
    dim_match = re.search(r"EMBEDDING_DIM\s*=\s*(\d+)", text)

    if not model_match or not dim_match:
        raise RuntimeError(f"Could not read embedding constants from {TS_CONSTANTS_PATH}")

    return model_match.group(1), int(dim_match.group(1))


EMBEDDING_MODEL_ID, EMBEDDING_DIM = _read_ts_constants()
