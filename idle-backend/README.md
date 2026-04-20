# idle-backend (Max Idle MVP)

Node.js + PostgreSQL backend for the Max Idle MVP.

## What is implemented

- `POST /auth/anonymous` creates an anonymous user and returns a JWT.
- `POST /auth/register` registers with email/password and creates a cookie session.
- `POST /auth/login` signs in with email/password and creates a cookie session.
- `POST /auth/logout` clears active auth session cookie.
- `GET /player` returns current persisted player state with `serverTime`.
- `POST /player/collect` computes elapsed time using server/database timestamps, adds it to balances, and resets the idle timer.
- `GET /account` returns account details for session or anonymous bearer users.
- `POST /account/upgrade` upgrades an anonymous user into a registered account.
- Better Auth mounted at `/api/auth/*` for framework-auth routes.
- PostgreSQL schema for `users` and `player_states`.
- Better Auth schema and game identity linkage table via migration.
- Unit and integration tests for time and auth/player lifecycle.

## Environment variables

Required:

- `PORT`
- `DATABASE_URL`
- `JWT_SECRET` (anonymous flow token)
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`

Optional:

- `CORS_ORIGIN` (default: `http://localhost:5173`)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`
- `APPLE_CLIENT_SECRET`

Google/Apple values are optional for now; UI buttons are present as placeholders for future OAuth enablement.

## Setup

1. Copy env vars:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start PostgreSQL (Docker):

   ```bash
   docker compose up -d
   ```

   This uses `docker-compose.yml` and matches `.env.example` defaults.

4. Run migration:

   ```bash
   npm run migrate
   ```

5. Start server:

   ```bash
   npm run dev
   ```

## Run tests

```bash
npm test
```

## Stop database container

```bash
docker compose down
```
