# idle-react (Max Idle MVP frontend)

Minimal React UI for Max Idle.

## Features

- Creates/uses an anonymous session token from the backend.
- Fetches player state and renders a live idle timer between syncs.
- Calls collect endpoint and refreshes player state.
- Stores token in local storage for persistence across refreshes.

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
