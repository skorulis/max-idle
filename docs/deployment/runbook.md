# Production Runbook

## Deploy a new release

1. Create and push a tag (example):

```bash
git tag v0.2.0
git push origin v0.2.0
```

2. Wait for GitHub Action `Deploy production` to finish.
3. Validate:
   - `https://api.<domain>/health`
   - `https://app.<domain>`
   - Login/register + gameplay flow

## Rollback to a previous release

1. SSH to VPS and run:

```bash
export IMAGE_TAG=v0.1.0
export BACKEND_IMAGE_REPO=ghcr.io/your-org/maxidle-backend
export FRONTEND_IMAGE_REPO=ghcr.io/your-org/maxidle-frontend
/opt/maxidle/deploy/scripts/deploy-release.sh
```

2. Re-verify health and user flows.

## Backups

Create a backup manually:

```bash
/opt/maxidle/deploy/scripts/backup-db.sh
```

Recommended cron (daily at 02:30 UTC, 14-day retention):

```bash
30 2 * * * DEPLOY_DIR=/opt/maxidle/deploy BACKUP_DIR=/opt/maxidle/backups RETENTION_DAYS=14 /opt/maxidle/deploy/scripts/backup-db.sh >> /var/log/maxidle-backup.log 2>&1
```

## Restore from backup

```bash
/opt/maxidle/deploy/scripts/restore-db.sh /opt/maxidle/backups/maxidle_YYYYMMDDTHHMMSSZ.sql.gz
```

Restore is destructive for live data. Take a fresh backup before restoring.

## Required GitHub secrets

- `PROD_BACKEND_IMAGE_REPO`
- `PROD_FRONTEND_IMAGE_REPO`
- `PROD_API_BASE_URL`
- `PROD_SERVER_HOST`
- `PROD_SERVER_USER`
- `PROD_SERVER_SSH_KEY`
- Optional (for private GHCR pulls on server):
  - `PROD_GHCR_USERNAME`
  - `PROD_GHCR_TOKEN`
