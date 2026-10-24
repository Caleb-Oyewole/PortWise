"""Load a tariff CSV into the database the app is configured for (DATABASE_URL).

    python -m scripts.load_catalog                 # data/tariffs_2026.csv
    python -m scripts.load_catalog my.csv --dry-run

Rows identical to the rate in force are skipped, so it is safe to run again.
"""
import argparse
import json
import pathlib

from app.admin.routes import run_import
from app.database import SessionLocal
from app.seed import init_database

DEFAULT_CSV = pathlib.Path(__file__).resolve().parent.parent / "data" / "tariffs_2026.csv"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", nargs="?", default=str(DEFAULT_CSV))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    init_database()
    db = SessionLocal()
    try:
        report = run_import(db, pathlib.Path(args.csv).read_text(encoding="utf8"), args.dry_run, "load_catalog script")
    finally:
        db.close()
    print(json.dumps(report["counts"], indent=2))
    for row in report["rows"]:
        if row["status"] == "error":
            print(f"row {row['row']} ({row['code']}): {row['message']}")


if __name__ == "__main__":
    main()
