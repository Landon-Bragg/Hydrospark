"""
Auto-seed: imports water usage data from seed_data/ if the database is empty.
Place your CSV or XLSX data file in backend/seed_data/ before first run.
The backend will auto-import it on startup when the water_usage table is empty.
"""

import os
import glob


class _SeedFileWrapper:
    """Mimics a Flask file upload object backed by a real file on disk."""

    def __init__(self, path):
        self.filename = os.path.basename(path)
        self._handle = open(path, 'rb')

    def read(self, *args, **kwargs):
        return self._handle.read(*args, **kwargs)

    def seek(self, *args, **kwargs):
        return self._handle.seek(*args, **kwargs)

    def tell(self):
        return self._handle.tell()

    def seekable(self):
        return True

    def __iter__(self):
        return iter(self._handle)

    def close(self):
        self._handle.close()


def run_auto_seed(app):
    """Import seed data if the water_usage table is empty."""
    seed_dir = os.path.join(os.path.dirname(__file__), 'seed_data')
    files = sorted(
        glob.glob(os.path.join(seed_dir, '*.csv')) +
        glob.glob(os.path.join(seed_dir, '*.xlsx'))
    )

    if not files:
        print("[seed] No seed files found in seed_data/ — skipping auto-seed.")
        return

    with app.app_context():
        from database import db, WaterUsage
        count = db.session.query(WaterUsage).count()
        if count > 0:
            print(f"[seed] Database already has {count} usage records — skipping auto-seed.")
            return

        seed_file = files[0]
        print(f"[seed] Database is empty. Auto-importing: {seed_file}")

        from services.data_import_service import DataImportService
        wrapper = _SeedFileWrapper(seed_file)
        try:
            result = DataImportService().import_usage_data(wrapper)
        finally:
            wrapper.close()

        if 'error' in result:
            print(f"[seed] Auto-seed failed: {result['error']}")
        else:
            print(
                f"[seed] Auto-seed complete — "
                f"{result.get('imported_records', 0)} records, "
                f"{result.get('customers_created', 0)} customers created."
            )
