# Production debugging (self-hosted Docker Compose)

Use this when deploy fails, a container is **unhealthy**, or Compose reports **dependency failed to start**.

## How production Compose wires services

Defined in `deploy/compose.production.yml`:

1. **Postgres** must pass its healthcheck before **migrate** and **backend** start.
2. **Backend** must pass its healthcheck before **Caddy** starts (Caddy `depends_on` with `condition: service_healthy`).
3. **Frontend** must be healthy before Caddy starts.

So a failing backend healthcheck often surfaces as: `dependency failed to start: container … is unhealthy` on **Caddy** or another dependent service—not always on the backend container name in the error.

## What each healthcheck actually tests

| Service   | Check |
|-----------|--------|
| postgres  | `pg_isready` for the configured user/database |
| backend   | HTTP `GET http://127.0.0.1:3000/health` inside the container (expects a successful response) |
| frontend  | `wget` to `http://127.0.0.1/health` inside the container |

If the backend process crashes on startup, never binds to port 3000, or `/health` returns an error status, the backend becomes **unhealthy** after several failed probes.

## Commands (run on the VPS)

Set your deploy directory and compose invocation to match how you deploy (examples use `/opt/maxidle/deploy` and `compose.production.yml`).

```bash
cd /opt/maxidle/deploy
# If you use IMAGE_TAG for releases, export it first, e.g. export IMAGE_TAG=release-0.2.0
```

### 1. Logs (start here)

```bash
docker compose --env-file .env.production -f compose.production.yml logs backend --tail 200
```

Include related services when the failure might be DB or migrations:

```bash
docker compose --env-file .env.production -f compose.production.yml logs postgres migrate backend
```

Follow logs live:

```bash
docker compose --env-file .env.production -f compose.production.yml logs -f backend
```

### 2. Container health history

Replace `<container>` with the actual name from `docker ps` (e.g. `deploy-backend-1`):

```bash
docker inspect <container> --format '{{json .State.Health}}' | jq
```

The `Log` entries show each probe result and help confirm whether failures are timeouts, connection refused, or non-OK HTTP status.

### 3. Reproduce the backend probe manually

```bash
docker exec -it <backend-container> node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text().then(t=>console.log(r.status,t))).catch(e=>console.error(e))"
```

### 4. List containers and status

```bash
docker ps -a
docker compose --env-file .env.production -f compose.production.yml ps
```

## Common causes

### Environment and database

- Wrong or missing variables in `.env.production` (especially `DATABASE_URL`, secrets, `PORT`).
- Postgres up but backend cannot connect (host name on Docker network is usually the **service name** `postgres`, not `localhost` from inside another container).
- **Migrate** failed or was not run; backend may error when the schema is missing. Check `migrate` logs from the same `docker compose logs` command as above.

### Application crashes before listening

Node stack traces appear in **backend logs**. Typical examples: uncaught exception at module load, failed `readFileSync` for a missing runtime file.

### Static files and data shipped in the image

The backend image copies compiled JS under `/app/dist` and additional paths from `idle-backend/Dockerfile` (for example `sql/`, `data/`). Code that uses paths relative to compiled output (e.g. under `dist/src/`) expects companion files under `/app/dist/...`. If you add new files read at runtime, ensure the Dockerfile **`COPY`** includes them into the path the code resolves to.

After changing what gets copied, rebuild and redeploy the **backend** image.

### Platform-specific

If you later move off plain Docker (Kubernetes, a PaaS), the same ideas apply: use that platform’s **logs**, **events**, and **health probe** details; map them to “process up”, “port reachable”, and “GET /health succeeds”.

## Quick external checks (after Caddy is up)

- `https://api.<your-domain>/health` — should return JSON indicating OK.
- Same path through the browser or `curl` helps verify TLS and routing, not only the in-container probe.

## Related docs

- Deploy overview: [README.md](./README.md)
- Rollback and backups: [runbook.md](./runbook.md)
