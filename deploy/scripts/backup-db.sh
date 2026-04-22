#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/maxidle/deploy}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose.production.yml}"
BACKUP_DIR="${BACKUP_DIR:-/opt/maxidle/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="${BACKUP_DIR}/maxidle_${timestamp}.sql.gz"

set -a
source "${ENV_FILE}"
set +a

cd "${DEPLOY_DIR}"

docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" exec -T postgres sh -lc \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip -c >"${backup_file}"

find "${BACKUP_DIR}" -type f -name 'maxidle_*.sql.gz' -mtime +"${RETENTION_DAYS}" -delete

echo "Backup written: ${backup_file}"
