#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/maxidle/deploy}"
ENV_FILE="${ENV_FILE:-${DEPLOY_DIR}/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-${DEPLOY_DIR}/compose.production.yml}"

if [[ -z "${IMAGE_TAG:-}" ]]; then
  echo "IMAGE_TAG is required (example: release-0.2.0; must match the pushed image tag)"
  exit 1
fi

if [[ -z "${BACKEND_IMAGE_REPO:-}" || -z "${FRONTEND_IMAGE_REPO:-}" ]]; then
  echo "BACKEND_IMAGE_REPO and FRONTEND_IMAGE_REPO are required"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}"
  exit 1
fi

if [[ "${GHCR_USERNAME:-}" != "" && "${GHCR_TOKEN:-}" != "" ]]; then
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
fi

cd "${DEPLOY_DIR}"

echo "Pulling images for tag ${IMAGE_TAG}..."
IMAGE_TAG="${IMAGE_TAG}" \
BACKEND_IMAGE_REPO="${BACKEND_IMAGE_REPO}" \
FRONTEND_IMAGE_REPO="${FRONTEND_IMAGE_REPO}" \
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" pull

echo "Running migrations..."
IMAGE_TAG="${IMAGE_TAG}" \
BACKEND_IMAGE_REPO="${BACKEND_IMAGE_REPO}" \
FRONTEND_IMAGE_REPO="${FRONTEND_IMAGE_REPO}" \
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" run --rm migrate

echo "Starting services..."
IMAGE_TAG="${IMAGE_TAG}" \
BACKEND_IMAGE_REPO="${BACKEND_IMAGE_REPO}" \
FRONTEND_IMAGE_REPO="${FRONTEND_IMAGE_REPO}" \
docker compose --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "Deployment complete."
