from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_REPORT_PATH = ROOT / "pipeline" / "reports" / "real_calibration.json"

# Matches the current real-model feature count used by train_real.py.
FEATURE_COUNT_FOR_PRODUCTION_MINIMUM = 21

# Matches the trainer production rule of 20 consented outcomes per feature.
OUTCOMES_PER_FEATURE_MINIMUM = 20
PRODUCTION_MIN_OUTCOMES = (
    FEATURE_COUNT_FOR_PRODUCTION_MINIMUM * OUTCOMES_PER_FEATURE_MINIMUM
)

# Held-out sample floor before a calibration report is useful for enablement.
MIN_HELDOUT_OUTCOMES = 100

# Calibration bins below this size are reported but not used for pass/fail.
MIN_CALIBRATION_BIN_SAMPLES = 30

# Avoid a vacuous pass when every calibration bin is too small to check.
MIN_CALIBRATION_BINS_WITH_ENOUGH_SAMPLES = 1

# Maximum absolute gap between observed admit rate and predicted-bin midpoint.
CALIBRATION_ABSOLUTE_TOLERANCE = 0.10

# Maximum held-out Brier score allowed by the gate.
MAX_BRIER_SCORE = 0.20

# Maximum held-out log loss allowed by the gate.
MAX_LOG_LOSS = 0.65


@dataclass
class GateCriterion:
    label: str
    passed: bool
    detail: str


def load_report(path: Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            report = json.load(handle)
    except FileNotFoundError as error:
        raise ValueError(f"report not found: {path}") from error
    except json.JSONDecodeError as error:
        raise ValueError(f"report is not valid JSON: {error}") from error

    if not isinstance(report, dict):
        raise ValueError("report root must be a JSON object")

    return report


def get_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def format_number(value: float) -> str:
    return f"{value:.6g}"


def parse_bin_midpoint(label: Any) -> float | None:
    if not isinstance(label, str):
        return None

    match = re.fullmatch(r"\s*([0-9]*\.?[0-9]+)-([0-9]*\.?[0-9]+)\s*", label)
    if not match:
        return None

    low = float(match.group(1))
    high = float(match.group(2))
    return (low + high) / 2


def check_status(report: dict[str, Any]) -> GateCriterion:
    status = report.get("status")
    source = report.get("source", "missing")
    if status == "trained" and source != "fixture":
        return GateCriterion(
            "Report status",
            True,
            f"status={status}, source={source}",
        )

    if status == "fixture_contract_check" or source == "fixture":
        return GateCriterion(
            "Report status",
            False,
            f"status={status}, source={source}; fixture reports cannot pass",
        )

    return GateCriterion(
        "Report status",
        False,
        f"status={status}, source={source}; expected status=trained",
    )


def check_total_outcomes(report: dict[str, Any]) -> GateCriterion:
    counts = report.get("outcome_counts_by_tier")
    if not isinstance(counts, dict) or not counts:
        return GateCriterion(
            "Total consented outcomes",
            False,
            "missing outcome_counts_by_tier",
        )

    total = 0.0
    for tier, value in counts.items():
        number = get_number(value)
        if number is None:
            return GateCriterion(
                "Total consented outcomes",
                False,
                f"tier {tier} has nonnumeric count {value!r}",
            )
        total += number

    return GateCriterion(
        "Total consented outcomes",
        total >= PRODUCTION_MIN_OUTCOMES,
        (
            f"total={format_number(total)}, required>="
            f"{PRODUCTION_MIN_OUTCOMES}"
        ),
    )


def check_heldout_count(report: dict[str, Any]) -> GateCriterion:
    heldout = get_number(report.get("heldout_count"))
    if heldout is None:
        return GateCriterion(
            "Held-out outcomes",
            False,
            "missing heldout_count",
        )

    return GateCriterion(
        "Held-out outcomes",
        heldout >= MIN_HELDOUT_OUTCOMES,
        f"heldout_count={format_number(heldout)}, required>={MIN_HELDOUT_OUTCOMES}",
    )


def check_metric(
    report: dict[str, Any],
    metric_name: str,
    ceiling: float,
    label: str,
) -> GateCriterion:
    metrics = report.get("metrics")
    if not isinstance(metrics, dict):
        return GateCriterion(label, False, "missing metrics object")

    value = get_number(metrics.get(metric_name))
    if value is None:
        return GateCriterion(label, False, f"missing metrics.{metric_name}")

    return GateCriterion(
        label,
        value <= ceiling,
        f"{metric_name}={format_number(value)}, required<={format_number(ceiling)}",
    )


def check_calibration_bins(report: dict[str, Any]) -> GateCriterion:
    bins = report.get("calibration_by_bin")
    if not isinstance(bins, list) or not bins:
        return GateCriterion(
            "Calibration bins",
            False,
            "missing calibration_by_bin rows",
        )

    checked: list[str] = []
    failures: list[str] = []
    skipped = 0

    for row in bins:
        if not isinstance(row, dict):
            return GateCriterion("Calibration bins", False, "bin row is not an object")

        label = row.get("bin")
        midpoint = parse_bin_midpoint(label)
        admitted = get_number(row.get("admitted_count"))
        outcomes = get_number(row.get("outcome_count"))

        if outcomes is None:
            return GateCriterion(
                "Calibration bins",
                False,
                f"bin {label!r} is missing outcome_count",
            )
        if outcomes < MIN_CALIBRATION_BIN_SAMPLES:
            skipped += 1
            continue
        if admitted is None:
            return GateCriterion(
                "Calibration bins",
                False,
                f"bin {label!r} is missing admitted_count",
            )
        if midpoint is None:
            return GateCriterion(
                "Calibration bins",
                False,
                f"bin {label!r} does not expose a parseable midpoint",
            )
        if outcomes <= 0:
            return GateCriterion(
                "Calibration bins",
                False,
                f"bin {label!r} has nonpositive outcome_count",
            )

        observed = admitted / outcomes
        gap = abs(observed - midpoint)
        detail = (
            f"{label}: n={format_number(outcomes)}, observed="
            f"{format_number(observed)}, midpoint={format_number(midpoint)}, "
            f"gap={format_number(gap)}"
        )
        checked.append(detail)
        if gap > CALIBRATION_ABSOLUTE_TOLERANCE:
            failures.append(detail)

    if len(checked) < MIN_CALIBRATION_BINS_WITH_ENOUGH_SAMPLES:
        return GateCriterion(
            "Calibration bins",
            False,
            (
                f"checked={len(checked)}, required>="
                f"{MIN_CALIBRATION_BINS_WITH_ENOUGH_SAMPLES}; "
                f"skipped={skipped} below n={MIN_CALIBRATION_BIN_SAMPLES}"
            ),
        )

    if failures:
        return GateCriterion(
            "Calibration bins",
            False,
            (
                f"{len(failures)} of {len(checked)} checked bins outside "
                f"tolerance {CALIBRATION_ABSOLUTE_TOLERANCE}: "
                + "; ".join(failures)
            ),
        )

    return GateCriterion(
        "Calibration bins",
        True,
        (
            f"{len(checked)} bins within tolerance "
            f"{CALIBRATION_ABSOLUTE_TOLERANCE}; skipped={skipped} below "
            f"n={MIN_CALIBRATION_BIN_SAMPLES}"
        ),
    )


def evaluate(report: dict[str, Any]) -> list[GateCriterion]:
    return [
        check_status(report),
        check_total_outcomes(report),
        check_heldout_count(report),
        check_calibration_bins(report),
        check_metric(report, "brier", MAX_BRIER_SCORE, "Brier score"),
        check_metric(report, "log_loss", MAX_LOG_LOSS, "Log loss"),
    ]


def print_results(results: list[GateCriterion]) -> None:
    for result in results:
        status = "PASS" if result.passed else "FAIL"
        print(f"{status} {result.label}: {result.detail}")

    gate_passed = all(result.passed for result in results)
    print(f"GATE: {'PASS' if gate_passed else 'FAIL'}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check whether real-outcome calibration evidence passes the serving gate.",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_REPORT_PATH,
        help="Path to real_calibration.json. Defaults to pipeline/reports/real_calibration.json.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        report = load_report(args.report)
    except ValueError as error:
        print(f"FAIL Report load: {error}")
        print("GATE: FAIL")
        return 1

    results = evaluate(report)
    print_results(results)
    return 0 if all(result.passed for result in results) else 1


if __name__ == "__main__":
    sys.exit(main())
