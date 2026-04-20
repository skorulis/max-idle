# Max Idle

Minimal web idle game where players are rewarded for inactivity.

## Project Index

- Product requirements: [`docs/max-idle-prd.md`](docs/max-idle-prd.md)
- Backend implementation: [`idle-backend/README.md`](idle-backend/README.md)
- Frontend implementation: [`idle-react/README.md`](idle-react/README.md)

## Implemented Parts (MVP)

- **Backend API (`idle-backend`)**
  - PostgreSQL schema + migration script
  - Docker Compose PostgreSQL setup

- **Frontend app (`idle-react`)**
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
