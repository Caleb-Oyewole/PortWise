"""Static rules the calculator needs that are not per-row tariff data."""
from __future__ import annotations

from typing import Optional

# Current ECOWAS members. Mali, Burkina Faso and Niger left in January 2025, so
# they are treated as non-ECOWAS here. Update this set if membership changes.
ECOWAS_MEMBERS = frozenset(
    {"NG", "BJ", "CV", "CI", "GM", "GH", "GN", "GW", "LR", "SN", "SL", "TG"}
)

# Goods whose duty rules differ from the standard stack (PRD E10). The calculator
# refuses these instead of showing a wrong number. Matched on the HS digits.
UNSUPPORTED_HEADINGS = (
    ("8702", "Buses and other passenger transport vehicles"),
    ("8703", "Passenger vehicles"),
    ("8704", "Goods vehicles"),
    ("2203", "Beer (excise goods)"),
    ("2204", "Wine (excise goods)"),
    ("2205", "Vermouth and flavoured wine (excise goods)"),
    ("2206", "Other fermented drinks (excise goods)"),
    ("2207", "Ethyl alcohol (excise goods)"),
    ("2208", "Spirits (excise goods)"),
    ("2402", "Cigars and cigarettes (excise goods)"),
    ("2403", "Other manufactured tobacco (excise goods)"),
)


def normalize_code(code: str) -> str:
    """'8517.12', '851712' and ' 8517.12 ' all become '851712'."""
    return (code or "").replace(".", "").replace(" ", "").strip().upper()


def unsupported_reason(code: str) -> Optional[str]:
    digits = normalize_code(code)
    for prefix, reason in UNSUPPORTED_HEADINGS:
        if digits.startswith(prefix):
            return (
                f"{reason}: vehicle levies, the green tax and excise or specific duties "
                "are not supported in this version"
            )
    return None


def is_ecowas_origin(origin: Optional[str]) -> bool:
    value = (origin or "").strip().upper()
    return value == "ECOWAS" or value in ECOWAS_MEMBERS
