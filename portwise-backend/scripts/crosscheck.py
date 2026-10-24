"""Write crosscheck.csv: PortWise results next to blank columns for the NTIP calculator.

Usage (from portwise-backend/):  python scripts/crosscheck.py [output.csv]

For each row, enter the same inputs in the official NTIP landed-cost calculator and fill
in the `ntip_*` columns. Differences beyond a few kobo point to a rule or rate that needs
reviewing (PRD B5). The duty rate is an input here, so check it against the tariff too.
"""
import csv
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from decimal import Decimal  # noqa: E402

from app.calculator import compute_breakdown  # noqa: E402

CASES = [  # (label, FOB NGN, freight+insurance NGN, duty %, ETLS on)
    ("PRD reference", "3000000", "450000", "20", True),
    ("Zero duty", "1000000", "100000", "0", True),
    ("5% duty, no ETLS", "2500000", "250000", "5", False),
    ("10% duty", "800000", "80000", "10", True),
    ("20% duty, small", "150000", "15000", "20", True),
    ("35% duty", "1200000", "120000", "35", True),
    ("Odd kobo values", "1550000.55", "155000.05", "20", True),
    ("Large shipment", "50000000", "5000000", "20", True),
]

FIELDS = ["duty_ngn", "levies_ngn", "vat_ngn", "total_landed_ngn"]


def main(path: str) -> None:
    header = ["case", "fob_ngn", "freight_insurance_ngn", "duty_pct", "etls", "regime"]
    header += [f"portwise_{f}" for f in FIELDS] + [f"ntip_{f}" for f in FIELDS] + ["difference_total", "notes"]
    with open(path, "w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(header)
        for label, fob, freight, duty, etls in CASES:
            for regime in ("legacy", "fob4"):
                b = compute_breakdown(Decimal(fob), Decimal(freight), Decimal(duty), regime, etls)
                ours = [b["duty_amount_ngn"], b["total_levies_ngn"], b["vat_amount_ngn"], b["total_landed_cost_ngn"]]
                writer.writerow([label, fob, freight, duty, "on" if etls else "off", regime]
                                + [str(v) for v in ours] + [""] * len(FIELDS) + ["", ""])
    print(f"Wrote {path}. Fill the ntip_* columns from the NTIP calculator.")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "crosscheck.csv")
