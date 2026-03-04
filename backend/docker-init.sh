#!/bin/bash
# Runs inside the MySQL container during first-time initialization.
# Loads the gzipped SQL data dump if present; otherwise the database
# starts empty (the backend's auto-seed will handle it from seed_data/).

DATA_FILE="/opt/seed/hydrospark_data.sql.gz"

if [ -f "$DATA_FILE" ]; then
    echo "[seed] Loading data dump: $DATA_FILE"
    gunzip -c "$DATA_FILE" | mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" --protocol=socket "${MYSQL_DATABASE}"
    echo "[seed] Data dump loaded successfully."
else
    echo "[seed] No data dump found — database will be seeded by the backend on first start."
fi
