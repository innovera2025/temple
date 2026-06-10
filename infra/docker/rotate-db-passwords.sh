#!/bin/sh
# Rotate the wat_app / wat_migrate database role passwords.
#
# WHY: the foundation migration creates these roles with well-known placeholder
# passwords committed to the repo (CREATE ROLE ... PASSWORD 'wat_app_password').
# That migration is already applied and its checksum must not change, so the
# fix is operational: rotate the passwords on every real deployment.
#
# NOTE: the application connects as the POSTGRES_USER superuser and uses
# SET ROLE — it does not log in as wat_app/wat_migrate — so rotating these
# passwords requires no application config change. They must still never be
# left at the committed defaults (anyone with network access to Postgres and
# the repo could log in directly as a role that can read tenant data).
#
# Usage (from the repo root, prod stack running):
#   ./infra/docker/rotate-db-passwords.sh
# or against a specific compose project:
#   COMPOSE_FILE=infra/docker/docker-compose.prod.yml ./infra/docker/rotate-db-passwords.sh
set -eu

COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.prod.yml}"

gen() { openssl rand -hex 24; }

APP_PW="$(gen)"
MIGRATE_PW="$(gen)"

docker compose -f "${COMPOSE_FILE}" exec -T db psql -U "${POSTGRES_USER:?set POSTGRES_USER}" -d "${POSTGRES_DB:-wat}" -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE wat_app WITH PASSWORD '${APP_PW}';
ALTER ROLE wat_migrate WITH PASSWORD '${MIGRATE_PW}';
SQL

echo "Rotated wat_app and wat_migrate passwords."
echo "Store these in your secret manager (they are NOT needed by the app today,"
echo "but keep them if you ever grant direct logins):"
echo "  wat_app:     ${APP_PW}"
echo "  wat_migrate: ${MIGRATE_PW}"
