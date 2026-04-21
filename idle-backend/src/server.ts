import { createApp, syncStalePlayerCurrentSeconds } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";

const STALE_PLAYER_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const STALE_PLAYER_SYNC_BATCH_SIZE = 100;

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const app = createApp(pool, config);
  let isSyncRunning = false;

  const runStalePlayerSync = async () => {
    if (isSyncRunning) {
      return;
    }
    isSyncRunning = true;
    try {
      await syncStalePlayerCurrentSeconds(pool, STALE_PLAYER_SYNC_BATCH_SIZE);
    } catch (error) {
      console.error("Failed stale player sync", error);
    } finally {
      isSyncRunning = false;
    }
  };

  const stalePlayerSyncTimer = setInterval(() => {
    void runStalePlayerSync();
  }, STALE_PLAYER_SYNC_INTERVAL_MS);
  stalePlayerSyncTimer.unref();
  void runStalePlayerSync();

  const server = app.listen(config.port, () => {
    console.log(`idle-backend listening on port ${config.port}`);
  });

  const shutdown = async () => {
    clearInterval(stalePlayerSyncTimer);
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
