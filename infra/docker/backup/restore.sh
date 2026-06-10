#!/bin/sh
# Restore one encrypted backup into the wat database. DESTRUCTIVE — restores
# with --clean (drops and recreates objects). Run it inside the backup
# container, pointing at a file in /backups:
#
#   docker compose -f infra/docker/docker-compose.prod.yml run --rm \
#     --entrypoint /bin/sh backup /backup/restore.sh /backups/wat-<db>-<stamp>.dump.enc
#
# Requires the same BACKUP_PASSPHRASE the file was written with, and
# RESTORE_CONFIRM=yes so it can never run by accident.
set -eu

FILE="${1:?usage: restore.sh /backups/<file>.dump.enc}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"

if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  echo "Refusing to restore: set RESTORE_CONFIRM=yes to overwrite database '${PGDATABASE}' on '${PGHOST}'" >&2
  exit 1
fi

echo "[restore] decrypting ${FILE} and restoring into ${PGDATABASE} on ${PGHOST}..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE -in "${FILE}" \
  | pg_restore --clean --if-exists --no-owner -d "${PGDATABASE}"
echo "[restore] done. Re-run 'prisma migrate deploy' if the dump predates the newest migrations."
