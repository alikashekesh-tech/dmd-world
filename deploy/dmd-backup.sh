#!/usr/bin/env bash
# Nightly backup of everything that can't be rebuilt from git: the MySQL database and the uploaded images.
# Run by dmd-world-backup.timer (see docs/deployment.md). Keeps 14 days; copy /var/backups/dmd-world off the server too.
#
# MySQL credentials come from an option file readable only by the backup user (never from this script):
#   /etc/dmd-world/backup.cnf   (chmod 600)
#     [client]
#     user=dmd_backup
#     password=…
# The dmd_backup account needs only: SELECT, SHOW VIEW, TRIGGER, EVENT on dmd_world.*
# (--set-gtid-purged=OFF spares it the global RELOAD/FLUSH_TABLES privilege MySQL 8 otherwise asks for; a restore
# into a new database doesn't need replication positions. Restore drill: docs/deployment.md §5.)
set -euo pipefail

DB="${DMD_DB:-dmd_world}"
APP="${DMD_APP:-/srv/dmd-world}"
OUT="${DMD_BACKUPS:-/var/backups/dmd-world}"
KEEP_DAYS="${DMD_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y-%m-%dT%H%MZ)"

umask 077
mkdir -p "$OUT"

# A consistent snapshot without locking the shop (InnoDB), with routines and triggers.
mysqldump --defaults-extra-file=/etc/dmd-world/backup.cnf --single-transaction --quick --routines --triggers \
  --set-gtid-purged=OFF --no-tablespaces "$DB" | gzip -9 > "$OUT/$DB-$STAMP.sql.gz.part"
mv "$OUT/$DB-$STAMP.sql.gz.part" "$OUT/$DB-$STAMP.sql.gz"

tar -czf "$OUT/uploads-$STAMP.tar.gz" -C "$APP/backend/storage/app" public

find "$OUT" -maxdepth 1 -type f \( -name '*.sql.gz' -o -name 'uploads-*.tar.gz' \) -mtime +"$KEEP_DAYS" -delete
echo "Backed up $DB and uploads to $OUT ($STAMP)"
