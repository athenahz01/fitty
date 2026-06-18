from __future__ import annotations

import math
import re
from typing import Any


FIT_FINDER_COLUMNS = [
    "unitid",
    "name",
    "state",
    "setting",
    "size",
    "admit_rate",
    "test_policy",
    "selectivity_tier",
    "program_areas",
    "size_band",
    "region",
    "net_price_avg",
    "sticker_cost",
    "median_earnings_10yr",
    "completion_rate",
]


def normalized_text(value: Any) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def normalized_label(value: Any) -> str | None:
    text = normalized_text(value)
    if not text:
        return None
    return text.replace("_", " ").lower()


def number_or_none(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number):
        return None
    return number


def format_money(value: Any) -> str | None:
    number = number_or_none(value)
    if number is None:
        return None
    return f"${int(round(number)):,}"


def format_percent(value: Any) -> str | None:
    number = number_or_none(value)
    if number is None:
        return None
    return f"{round(number * 100)}%"


def clean_program_areas(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []

    cleaned = []
    for item in value:
        text = normalized_text(item)
        if text:
            cleaned.append(text)

    return sorted(dict.fromkeys(cleaned), key=lambda item: item.lower())


def build_school_document(row: dict[str, Any]) -> str:
    """Build a deterministic school fit document from public school attributes.

    The document omits missing values, normalizes whitespace, sorts program areas,
    and uses stable sentence ordering so the same row always yields the same text.
    """

    name = normalized_text(row.get("name")) or f"School {row.get('unitid')}"
    sentences = [f"{name}."]

    size_band = normalized_label(row.get("size_band"))
    setting = normalized_label(row.get("setting"))
    region = normalized_text(row.get("region"))
    location_parts = []

    if size_band:
        location_parts.append(size_band)
    if setting:
        location_parts.append(setting)
    descriptor = " ".join(location_parts)

    if descriptor and region:
        sentences.append(f"{descriptor} school in the {region}.")
    elif descriptor:
        sentences.append(f"{descriptor} school.")
    elif region:
        sentences.append(f"School in the {region}.")

    program_areas = clean_program_areas(row.get("program_areas"))
    if program_areas:
        sentences.append(f"Programs: {', '.join(program_areas)}.")

    selectivity = normalized_label(row.get("selectivity_tier"))
    test_policy = normalized_label(row.get("test_policy"))
    selectivity_parts = []
    if selectivity:
        selectivity_parts.append(f"selectivity {selectivity}")
    if test_policy:
        selectivity_parts.append(f"test policy {test_policy}")
    if selectivity_parts:
        sentences.append(f"Admissions: {', '.join(selectivity_parts)}.")

    outcome_parts = []
    completion = format_percent(row.get("completion_rate"))
    earnings = format_money(row.get("median_earnings_10yr"))
    if completion:
        outcome_parts.append(f"completion {completion}")
    if earnings:
        outcome_parts.append(f"median earnings {earnings}")
    if outcome_parts:
        sentences.append(f"Outcomes: {', '.join(outcome_parts)}.")

    cost_parts = []
    net_price = format_money(row.get("net_price_avg"))
    sticker_cost = format_money(row.get("sticker_cost"))
    if net_price:
        cost_parts.append(f"published net price {net_price}")
    if sticker_cost:
        cost_parts.append(f"published sticker cost {sticker_cost}")
    if cost_parts:
        sentences.append(f"Costs: {', '.join(cost_parts)}.")

    return " ".join(sentences)
