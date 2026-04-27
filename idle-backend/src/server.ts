import { createApp, syncStalePlayerCurrentSeconds } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";
import { finalizeDueTournaments, getDelayUntilNextTournamentDrawMs } from "./tournaments.js";
import { configureWebPush, isPushConfigured, sendDueDailyRewardPushNotifications } from "./push.js";

const STALE_PLAYER_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const STALE_PLAYER_SYNC_BATCH_SIZE = 100;
const DAILY_REWARD_PUSH_SCAN_INTERVAL_MS = 60 * 1000;

async function main(): Promise<void> {
  const config = loadConfig();
  configureWebPush(config);
  const pool = createPool(config.databaseUrl);
  const app = createApp(pool, config);
  let isSyncRunning = false;
  let isTournamentFinalizationRunning = false;
  let isDailyRewardPushScanRunning = false;
  let tournamentTimer: NodeJS.Timeout | null = null;

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

  const runTournamentFinalization = async () => {
    if (isTournamentFinalizationRunning) {
      return;
    }
    isTournamentFinalizationRunning = true;
    try {
      const finalizedCount = await finalizeDueTournaments(pool);
      if (finalizedCount > 0) {
        console.log(`Finalized ${finalizedCount} tournament draw(s).`);
      }
    } catch (error) {
      console.error("Failed tournament finalization", error);
    } finally {
      isTournamentFinalizationRunning = false;
    }
  };

  const runDailyRewardPushScan = async () => {
    if (!isPushConfigured(config) || isDailyRewardPushScanRunning) {
      return;
    }
    isDailyRewardPushScanRunning = true;
    try {
      const sentCount = await sendDueDailyRewardPushNotifications(pool);
      if (sentCount > 0) {
        console.log(`Sent ${sentCount} daily reward push notification(s).`);
      }
    } catch (error) {
      console.error("Failed daily reward push scan", error);
    } finally {
      isDailyRewardPushScanRunning = false;
    }
  };

  const scheduleTournamentFinalization = () => {
    if (tournamentTimer) {
      clearTimeout(tournamentTimer);
    }
    const delayMs = getDelayUntilNextTournamentDrawMs(new Date());
    tournamentTimer = setTimeout(() => {
      void runTournamentFinalization().finally(() => {
        scheduleTournamentFinalization();
      });
    }, delayMs);
    tournamentTimer.unref();
  };

  const stalePlayerSyncTimer = setInterval(() => {
    void runStalePlayerSync();
  }, STALE_PLAYER_SYNC_INTERVAL_MS);
  stalePlayerSyncTimer.unref();
  const dailyRewardPushScanTimer = setInterval(() => {
    void runDailyRewardPushScan();
  }, DAILY_REWARD_PUSH_SCAN_INTERVAL_MS);
  dailyRewardPushScanTimer.unref();
  void runStalePlayerSync();
  void runDailyRewardPushScan();
  await runTournamentFinalization();
  scheduleTournamentFinalization();

  const server = app.listen(config.port, () => {
    console.log(`idle-backend listening on port ${config.port}`);
  });

  const shutdown = async () => {
    clearInterval(stalePlayerSyncTimer);
    clearInterval(dailyRewardPushScanTimer);
    if (tournamentTimer) {
      clearTimeout(tournamentTimer);
    }
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
