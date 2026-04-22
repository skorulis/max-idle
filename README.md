# Max Idle

Minimal web idle game where players are rewarded for inactivity.

## Project Index

- Product requirements: [`docs/max-idle-prd.md`](docs/max-idle-prd.md)
- Backend implementation: [`idle-backend/README.md`](idle-backend/README.md)
- Frontend implementation: [`idle-react/README.md`](idle-react/README.md)
- Production deployment: [`docs/deployment/README.md`](docs/deployment/README.md)

## Implemented Parts (MVP)

- **Backend API (`idle-backend`)**
  - Anonymous auth (`POST /auth/anonymous`)
  - Email/password auth (`POST /auth/register`, `POST /auth/login`, `POST /auth/logout`)
  - Account endpoints (`GET /account`, `POST /account/upgrade`)
  - Better Auth integration mounted at `/api/auth/*`
  - Cookie-session auth for registered users + bearer token flow for anonymous users
  - PostgreSQL schema + migration script
  - Docker Compose PostgreSQL setup

- **Frontend app (`idle-react`)**
  - Landing page with `Start idling` + `Login`
  - `/account` page with account info and anonymous upgrade form
  - Email/password login and registration UI
  - Google/Apple auth buttons as placeholders for future OAuth
  - Anonymous session bootstrap and token persistence
  - Live idle timer rendering between server syncs
  - Collect interaction wired to backend
  - Minimal UI ready for future styling improvements

## Quick Start

1. Start database:
   - See [`idle-backend/docker-compose.yml`](idle-backend/docker-compose.yml)
2. Run backend:
   - Follow [`idle-backend/README.md`](idle-backend/README.md)
3. Run frontend:
   - Follow [`idle-react/README.md`](idle-react/README.md)
