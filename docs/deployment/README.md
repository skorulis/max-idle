# Production Deployment (Self-Hosted)

This guide documents a production setup for Max Idle using:

- One Ubuntu VPS
- Docker Compose
- Caddy (TLS + reverse proxy)
- GHCR images deployed by git tags

## 1) Provision VPS + DNS

1. Create an Ubuntu 24.04 VPS (2 vCPU / 4 GB RAM recommended).
2. Add DNS `A` records:
   - `app.your-domain.com` -> VPS public IP
   - `api.your-domain.com` -> VPS public IP
3. SSH to the server and run:

```bash
sudo bash deploy/scripts/bootstrap-vps.sh
```

Run that from a checked-out copy of this repo after you upload it (or copy just the script to the server first).

## 2) Configure production environment

On the VPS:

```bash
cp /opt/maxidle/deploy/.env.production.example /opt/maxidle/deploy/.env.production
```

Edit `/opt/maxidle/deploy/.env.production` and set:

- Domains (`APP_DOMAIN`, `API_DOMAIN`)
- Image repos (`BACKEND_IMAGE_REPO`, `FRONTEND_IMAGE_REPO`)
- DB credentials and `DATABASE_URL`
- Auth/CORS settings (`CORS_ORIGIN`, `BETTER_AUTH_URL`)
- Strong secrets (`JWT_SECRET`, `BETTER_AUTH_SECRET`)
- Analytics config (`AMPLITUDE_API_KEY`)

## 3) First deploy (manual)

Run from VPS:

```bash
cd /opt/maxidle/deploy
IMAGE_TAG=release-0.1.0 docker compose --env-file .env.production -f compose.production.yml pull
IMAGE_TAG=release-0.1.0 docker compose --env-file .env.production -f compose.production.yml run --rm migrate
IMAGE_TAG=release-0.1.0 docker compose --env-file .env.production -f compose.production.yml up -d --remove-orphans
```

## 4) Future deploys (tag-based)

1. Push a release tag (example: `release/0.2.0`).
2. GitHub Actions builds/pushes images to GHCR.
3. GitHub Actions SSHes to VPS and runs deploy using a Docker-safe image tag derived from the git tag (for example, `release/0.2.0` becomes `release-0.2.0`).

## 5) Verify

- `https://api.your-domain.com/health` returns `{"ok":true}`
- Frontend loads at `https://app.your-domain.com`
- Anonymous, login/register, and leaderboard flows work
- Trigger a gameplay action (collect, purchase, daily reward/bonus) and confirm events appear in Amplitude
- If enabling Google OAuth, set callback URL in provider config to:
  - `https://api.your-domain.com/api/auth/callback/google`

## 6) Operations

- DB backup script: `deploy/scripts/backup-db.sh`
- Restore helper: `deploy/scripts/restore-db.sh`
- Rollback guide: `docs/deployment/runbook.md`
- When a container is **unhealthy** or Compose reports **dependency failed to start**: [production debugging](./production-debugging.md)

## 7) Wipe production database (destructive)

If you want a full reset, the simplest approach is to remove the Postgres Docker volume.

```bash
cd /opt/maxidle/deploy

# Optional but recommended
./scripts/backup-db.sh

# Stop services and remove only the DB volume
docker compose --env-file .env.production -f compose.production.yml down
docker volume rm deploy_max_idle_pg_data

# Start again (creates a fresh empty DB), then run migrations
IMAGE_TAG="${IMAGE_TAG:-latest}" docker compose --env-file .env.production -f compose.production.yml up -d --remove-orphans
IMAGE_TAG="${IMAGE_TAG:-latest}" docker compose --env-file .env.production -f compose.production.yml run --rm migrate
```
