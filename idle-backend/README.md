# idle-backend (Max Idle MVP)

Node.js + PostgreSQL backend for the Max Idle MVP.

## What is implemented

- `POST /auth/anonymous` creates an anonymous user and returns a JWT.
- `GET /player` returns current persisted player state with `serverTime`.
- `POST /player/collect` computes elapsed time using server/database timestamps, adds it to balances, and resets the idle timer.
- PostgreSQL schema for `users` and `player_states`.
- Unit and integration tests for time and auth/player lifecycle.

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
