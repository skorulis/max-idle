#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/backup.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/maxidle/deploy}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose.production.yml}"

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}"
  exit 1
fi

read -r -p "This will replace current DB data. Continue? (yes/no): " confirm
if [[ "${confirm}" != "yes" ]]; then
  echo "Cancelled."
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

cd "${DEPLOY_DIR}"

gunzip -c "${BACKUP_FILE}" | docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

echo "Restore complete from ${BACKUP_FILE}"
