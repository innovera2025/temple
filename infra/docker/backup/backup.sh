#!/bin/sh
# Encrypted Postgres backup loop for the wat prod stack (see docker-compose.prod.yml).
#
# Every BACKUP_INTERVAL_SECONDS (default daily): pg_dump custom format,
# encrypted with AES-256 (openssl enc, PBKDF2, passphrase from
# BACKUP_PASSPHRASE), written atomically to /backups, oldest pruned beyond
# BACKUP_KEEP. Restore: infra/docker/backup/restore.sh (manual, documented in
# infra/docker/BACKUP.md). Backups that stay on the same host do NOT protect
# against disk loss — copy /backups offsite (see BACKUP.md).
set -eu

: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
KEEP="${BACKUP_KEEP:-14}"
DIR="/backups"

run_backup() {
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  tmp="${DIR}/.partial-${stamp}"
  out="${DIR}/wat-${PGDATABASE}-${stamp}.dump.enc"

  # pg_dump -Fc: compressed custom format, restorable table-by-table.
  if pg_dump -Fc --no-owner | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 \
      -salt -pass env:BACKUP_PASSPHRASE -out "${tmp}"; then
    mv "${tmp}" "${out}"
    echo "[backup] wrote ${out} ($(wc -c < "${out}") bytes)"
  else
    rm -f "${tmp}"
    echo "[backup] FAILED at ${stamp}" >&2
    return 1
  fi

  # Retention: keep the newest $KEEP encrypted dumps.
  ls -1t "${DIR}"/wat-*.dump.enc 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
    echo "[backup] pruning ${old}"
    rm -f "${old}"
  done
}

echo "[backup] starting: every ${INTERVAL}s, keep ${KEEP}, target ${DIR}"
# First backup immediately on boot, then loop. A failed cycle logs and retries
# next interval rather than crash-looping the container.
while :; do
  run_backup || true
  sleep "${INTERVAL}"
done
