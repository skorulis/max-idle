# idle-react (Max Idle MVP frontend)

Minimal React UI for Max Idle.

## Features

- Landing page supports:
  - `Start idling` (anonymous user creation)
  - `Login` option
- Email/password login + registration flow.
- Account page at `/account`:
  - Shows user/account info
  - Allows anonymous users to upgrade to a registered account
- Fetches player state and renders a live idle timer between server syncs.
- Supports both anonymous bearer token flow and cookie-based authenticated flow.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Start frontend:

   ```bash
   npm run dev
   ```

By default the frontend calls `http://localhost:3000`.

## API types

Generate frontend API types from the backend OpenAPI spec:

```bash
npm run api:types:generate
```

Check for drift (fails if generated types are outdated):

```bash
npm run api:types:check
```
