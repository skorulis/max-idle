import type { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { finalizeDueTournaments, getNextTournamentDrawAt } from "../../src/tournaments.js";
import { createTestPool, resetTestDatabase } from "../testDb.js";
import { createTestAppConfig } from "../testAppConfig.js";

describe("tournament routes", () => {
  const config = createTestAppConfig();
  let pool: Pool;

  async function unlockTournamentFeature(
    app: ReturnType<typeof createApp>,
    token: string,
    userId: string
  ): Promise<void> {
    await pool.query(`UPDATE player_states SET time_gems_available = time_gems_available + 2 WHERE user_id = $1`, [userId]);
    const purchase = await request(app)
      .post("/shop/purchase")
      .set("Authorization", `Bearer ${token}`)
      .send({ upgradeType: "tournament_feature" });
    expect(purchase.status).toBe(200);
  }

  async function createTournamentEntrant(
    app: ReturnType<typeof createApp>,
    secondsSinceLastCollection: number
  ): Promise<{ userId: string; token: string }> {
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;
    const lastCollectedAt = new Date(Date.now() - secondsSinceLastCollection * 1000);
    await pool.query(
      `
      UPDATE player_states
      SET
        last_collected_at = $2,
        current_seconds_last_updated = $2
      WHERE user_id = $1
      `,
      [userId, lastCollectedAt]
    );
    await unlockTournamentFeature(app, token, userId);
    const enterResponse = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(enterResponse.status).toBe(200);
    return { userId, token };
  }

  beforeAll(async () => {
    pool = await createTestPool();
  });

  beforeEach(async () => {
    await resetTestDatabase(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("returns 403 from tournament routes when the weekly tournament shop upgrade is locked", async () => {
    const app = createApp(pool, config);
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const currentLocked = await request(app).get("/tournament/current").set("Authorization", `Bearer ${token}`);
    expect(currentLocked.status).toBe(403);
    expect(currentLocked.body.code).toBe("TOURNAMENT_FEATURE_LOCKED");

    const enterLocked = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(enterLocked.status).toBe(403);
    expect(enterLocked.body.code).toBe("TOURNAMENT_FEATURE_LOCKED");

    const collectLocked = await request(app).post("/tournament/collect-reward").set("Authorization", `Bearer ${token}`);
    expect(collectLocked.status).toBe(403);
    expect(collectLocked.body.code).toBe("TOURNAMENT_FEATURE_LOCKED");

    const historyLocked = await request(app).get("/tournament/history").set("Authorization", `Bearer ${token}`);
    expect(historyLocked.status).toBe(403);
    expect(historyLocked.body.code).toBe("TOURNAMENT_FEATURE_LOCKED");
  });

  it("returns tournament history after a finalized tournament", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");
    const entrant = await createTournamentEntrant(app, 600);

    const emptyHistory = await request(app).get("/tournament/history").set("Authorization", `Bearer ${entrant.token}`);
    expect(emptyHistory.status).toBe(200);
    expect(emptyHistory.body.history).toEqual([]);

    await pool.query(
      `
      UPDATE tournaments
      SET draw_at_utc = NOW() - INTERVAL '1 second'
      WHERE is_active = TRUE
      `
    );
    const finalizedCount = await finalizeDueTournaments(pool, new Date());
    expect(finalizedCount).toBe(1);

    const historyResponse = await request(app).get("/tournament/history").set("Authorization", `Bearer ${entrant.token}`);
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.history).toHaveLength(1);
    const row = historyResponse.body.history[0] as {
      drawAt: string;
      finalRank: number;
      playerCount: number;
      gemsAwarded: number;
    };
    expect(row.finalRank).toBe(1);
    expect(row.playerCount).toBe(1);
    expect(row.gemsAwarded).toBe(5);
    expect(typeof row.drawAt).toBe("string");
  });

  it("returns current weekly tournament state and allows entering once", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await unlockTournamentFeature(app, token, userId);

    const currentBeforeEntry = await request(app).get("/tournament/current").set("Authorization", `Bearer ${token}`);
    expect(currentBeforeEntry.status).toBe(200);
    expect(currentBeforeEntry.body.hasEntered).toBe(false);
    expect(currentBeforeEntry.body.playerCount).toBe(0);
    expect(currentBeforeEntry.body.currentRank).toBeNull();
    expect(currentBeforeEntry.body.expectedRewardGems).toBeNull();
    expect(currentBeforeEntry.body.nearbyEntries).toEqual([]);
    expect(currentBeforeEntry.body.entry).toBeNull();
    expect(currentBeforeEntry.body.outstanding_result).toBeNull();
    expect(typeof currentBeforeEntry.body.drawAt).toBe("string");
    expect(currentBeforeEntry.body.isActive).toBe(true);

    const firstEnter = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(firstEnter.status).toBe(200);
    expect(firstEnter.body.enteredNow).toBe(true);
    expect(firstEnter.body.tournament.hasEntered).toBe(true);
    expect(firstEnter.body.tournament.playerCount).toBe(1);
    expect(firstEnter.body.tournament.currentRank).toBe(1);
    expect(firstEnter.body.tournament.expectedRewardGems).toBe(5);
    expect(firstEnter.body.tournament.nearbyEntries).toHaveLength(1);
    expect(firstEnter.body.tournament.nearbyEntries[0].rank).toBe(1);
    expect(firstEnter.body.tournament.nearbyEntries[0].userId).toBe(userId);
    expect(firstEnter.body.tournament.nearbyEntries[0].isCurrentPlayer).toBe(true);
    expect(firstEnter.body.tournament.entry.enteredAt).toBeTypeOf("string");

    const secondEnter = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(secondEnter.status).toBe(200);
    expect(secondEnter.body.enteredNow).toBe(false);
    expect(secondEnter.body.tournament.hasEntered).toBe(true);

    const entryCountResult = await pool.query<{ entry_count: string }>(
      `
      SELECT COUNT(*) AS entry_count
      FROM tournament_entries
      WHERE user_id = $1
      `,
      [userId]
    );
    expect(Number(entryCountResult.rows[0]?.entry_count ?? 0)).toBe(1);
  });

  it("returns top players on GET /tournament/current when the viewer has not entered", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");

    const entrantA = await createTournamentEntrant(app, 5000);

    const authB = await request(app).post("/auth/anonymous");
    expect(authB.status).toBe(201);
    const tokenB = authB.body.token as string;
    const userIdB = authB.body.userId as string;
    await unlockTournamentFeature(app, tokenB, userIdB);

    const currentB = await request(app).get("/tournament/current").set("Authorization", `Bearer ${tokenB}`);
    expect(currentB.status).toBe(200);
    expect(currentB.body.hasEntered).toBe(false);
    expect(currentB.body.playerCount).toBe(1);
    expect(currentB.body.nearbyEntries).toHaveLength(1);
    expect(currentB.body.nearbyEntries[0].rank).toBe(1);
    expect(currentB.body.nearbyEntries[0].userId).toBe(entrantA.userId);
    expect(currentB.body.nearbyEntries[0].isCurrentPlayer).toBe(false);
    expect(userIdB).not.toBe(entrantA.userId);
  });

  it("returns 20 tournament players above and below the current player rank", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");

    const entrants: Array<{ userId: string; token: string }> = [];
    for (let i = 0; i < 45; i += 1) {
      entrants.push(await createTournamentEntrant(app, 5000 - i * 10));
    }
    const middleEntrant = entrants[22];

    const currentTournamentResponse = await request(app)
      .get("/tournament/current")
      .set("Authorization", `Bearer ${middleEntrant.token}`);
    expect(currentTournamentResponse.status).toBe(200);
    expect(currentTournamentResponse.body.currentRank).toBe(23);
    expect(currentTournamentResponse.body.nearbyEntries).toHaveLength(41);
    expect(currentTournamentResponse.body.nearbyEntries[0].rank).toBe(3);
    expect(currentTournamentResponse.body.nearbyEntries[40].rank).toBe(43);

    const currentPlayerEntry = currentTournamentResponse.body.nearbyEntries.find(
      (entry: { isCurrentPlayer: boolean }) => entry.isCurrentPlayer
    );
    expect(currentPlayerEntry).toBeDefined();
    expect(currentPlayerEntry.rank).toBe(23);
    expect(currentPlayerEntry.userId).toBe(middleEntrant.userId);
    expect(typeof currentPlayerEntry.username).toBe("string");
  });

  it("finalizes tournament rankings with NTILE rewards and avoids double-awarding", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");
    const entrants: Array<{ userId: string; token: string }> = [];
    const idleSeconds = [600, 500, 400, 300, 200, 100];
    for (const seconds of idleSeconds) {
      entrants.push(await createTournamentEntrant(app, seconds));
    }

    await pool.query(
      `
      UPDATE tournaments
      SET draw_at_utc = NOW() - INTERVAL '1 second'
      WHERE is_active = TRUE
      `
    );
    const finalizedCount = await finalizeDueTournaments(pool, new Date());
    expect(finalizedCount).toBe(1);

    const rankingResult = await pool.query<{
      user_id: string;
      final_rank: string;
      time_score_seconds: string;
      gems_awarded: string;
    }>(
      `
      SELECT user_id, final_rank, time_score_seconds, gems_awarded
      FROM tournament_entries
      WHERE final_rank IS NOT NULL
      ORDER BY final_rank ASC
      `
    );
    expect(rankingResult.rows).toHaveLength(6);
    expect(rankingResult.rows.map((row) => Number(row.gems_awarded))).toEqual([5, 5, 4, 3, 2, 1]);
    expect(rankingResult.rows.map((row) => Number(row.final_rank))).toEqual([1, 2, 3, 4, 5, 6]);

    const finalizedTournamentIdResult = await pool.query<{ id: string }>(
      `
      SELECT id
      FROM tournaments
      WHERE finalized_at IS NOT NULL
      ORDER BY finalized_at DESC, id DESC
      LIMIT 1
      `
    );
    const finalizedTournamentId = Number(finalizedTournamentIdResult.rows[0]?.id ?? 0);

    const gemsBeforeCollect = await pool.query<{ user_id: string; time_gems_total: string }>(
      `
      SELECT ps.user_id, ps.time_gems_total
      FROM player_states ps
      INNER JOIN tournament_entries te ON te.user_id = ps.user_id AND te.tournament_id = $1
      `,
      [finalizedTournamentId]
    );
    expect(gemsBeforeCollect.rows.every((row) => Number(row.time_gems_total) === 0)).toBe(true);

    const tokenByUserId = new Map<string, string>();
    for (const entrant of entrants) {
      tokenByUserId.set(entrant.userId, entrant.token);
    }

    for (const row of rankingResult.rows) {
      const token = tokenByUserId.get(row.user_id);
      expect(token).toBeTruthy();
      const collectResponse = await request(app).post("/tournament/collect-reward").set("Authorization", `Bearer ${token!}`);
      expect(collectResponse.status).toBe(200);
      expect(collectResponse.body.gemsCollected).toBe(Number(row.gems_awarded));
      const dupCollect = await request(app).post("/tournament/collect-reward").set("Authorization", `Bearer ${token!}`);
      expect(dupCollect.status).toBe(400);
      expect(dupCollect.body.code).toBe("NO_TOURNAMENT_REWARD_TO_COLLECT");
    }

    const gemsResult = await pool.query<{ user_id: string; time_gems_total: string }>(
      `
      SELECT ps.user_id, ps.time_gems_total
      FROM player_states ps
      INNER JOIN tournament_entries te ON te.user_id = ps.user_id AND te.tournament_id = $1
      ORDER BY ps.time_gems_total DESC, ps.user_id ASC
      `,
      [finalizedTournamentId]
    );
    expect(gemsResult.rows.map((row) => Number(row.time_gems_total))).toEqual([5, 5, 4, 3, 2, 1]);

    const finalizedAgain = await finalizeDueTournaments(pool, new Date());
    expect(finalizedAgain).toBe(0);
    const gemSumResult = await pool.query<{ total_gems: string }>(
      `
      SELECT COALESCE(SUM(ps.time_gems_total), 0) AS total_gems
      FROM player_states ps
      INNER JOIN tournament_entries te ON te.user_id = ps.user_id AND te.tournament_id = $1
      `,
      [finalizedTournamentId]
    );
    expect(Number(gemSumResult.rows[0]?.total_gems ?? 0)).toBe(20);

    await pool.query(
      `
      UPDATE player_states
      SET
        current_seconds = 0,
        idle_time_total = 0,
        idle_time_available = 0
      WHERE user_id = ANY($1::uuid[])
      `,
      [entrants.map((entrant) => entrant.userId)]
    );
  });

  it("debug-finalizes current tournament early and recreates with same draw_at_utc", async () => {
    const app = createApp(pool, config);
    await pool.query("DELETE FROM tournament_entries");
    await pool.query("DELETE FROM tournaments");
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;
    const userId = authResponse.body.userId as string;

    await unlockTournamentFeature(app, token, userId);
    const currentBefore = await request(app).get("/tournament/current").set("Authorization", `Bearer ${token}`);
    expect(currentBefore.status).toBe(200);
    const drawAtBefore = currentBefore.body.drawAt as string;

    const activeBefore = await pool.query<{ id: string }>(`SELECT id FROM tournaments WHERE is_active = TRUE LIMIT 1`);
    const tournamentIdBefore = Number(activeBefore.rows[0]?.id);

    const enterResponse = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(enterResponse.status).toBe(200);

    const debugResponse = await request(app)
      .post("/tournament/debug/finalize-current")
      .set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(200);
    expect(debugResponse.body.ok).toBe(true);
    expect(debugResponse.body.finalizedTournamentId).toBe(tournamentIdBefore);
    expect(debugResponse.body.newTournamentId).not.toBe(tournamentIdBefore);
    expect(debugResponse.body.drawAtUtc).toBe(drawAtBefore);
    expect(debugResponse.body.entryCount).toBe(1);

    const activeAfter = await pool.query<{ id: string; draw_at_utc: Date }>(
      `SELECT id, draw_at_utc FROM tournaments WHERE is_active = TRUE LIMIT 1`
    );
    expect(Number(activeAfter.rows[0]?.id)).toBe(debugResponse.body.newTournamentId);
    expect(activeAfter.rows[0]?.draw_at_utc.toISOString()).toBe(drawAtBefore);

    const finalizedRow = await pool.query<{ finalized_at: Date | null }>(
      `SELECT finalized_at FROM tournaments WHERE id = $1`,
      [tournamentIdBefore]
    );
    expect(finalizedRow.rows[0]?.finalized_at).not.toBeNull();

    const gemsRowAfterFinalize = await pool.query<{ time_gems_total: string; time_gems_available: string }>(
      `SELECT time_gems_total, time_gems_available FROM player_states WHERE user_id = $1`,
      [userId]
    );
    expect(Number(gemsRowAfterFinalize.rows[0]?.time_gems_total)).toBe(0);
    expect(Number(gemsRowAfterFinalize.rows[0]?.time_gems_available)).toBe(0);

    const currentAfterFinalize = await request(app).get("/tournament/current").set("Authorization", `Bearer ${token}`);
    expect(currentAfterFinalize.status).toBe(200);
    expect(currentAfterFinalize.body.outstanding_result).toBeTruthy();
    expect(currentAfterFinalize.body.outstanding_result.gemsAwarded).toBe(5);
    expect(currentAfterFinalize.body.outstanding_result.playerCount).toBe(1);

    const homeAfterFinalize = await request(app).get("/home").set("Authorization", `Bearer ${token}`);
    expect(homeAfterFinalize.body.tournament?.outstanding_result?.gemsAwarded).toBe(5);

    const enterAfterFinalize = await request(app).post("/tournament/enter").set("Authorization", `Bearer ${token}`);
    expect(enterAfterFinalize.status).toBe(409);
    expect(enterAfterFinalize.body.code).toBe("TOURNAMENT_REWARD_UNCOLLECTED");

    const collectResponse = await request(app).post("/tournament/collect-reward").set("Authorization", `Bearer ${token}`);
    expect(collectResponse.status).toBe(200);
    expect(collectResponse.body.gemsCollected).toBe(5);

    const gemsRow = await pool.query<{ time_gems_total: string; time_gems_available: string }>(
      `SELECT time_gems_total, time_gems_available FROM player_states WHERE user_id = $1`,
      [userId]
    );
    expect(Number(gemsRow.rows[0]?.time_gems_total)).toBe(5);
    expect(Number(gemsRow.rows[0]?.time_gems_available)).toBe(5);
  });

  it("computes next tournament draw at Sunday 00:00 UTC", () => {
    const mondayUtc = new Date("2026-04-20T10:00:00.000Z");
    const nextFromMonday = getNextTournamentDrawAt(mondayUtc);
    expect(nextFromMonday.toISOString()).toBe("2026-04-26T00:00:00.000Z");

    const sundayAfterMidnightUtc = new Date("2026-04-26T04:30:00.000Z");
    const nextFromSunday = getNextTournamentDrawAt(sundayAfterMidnightUtc);
    expect(nextFromSunday.toISOString()).toBe("2026-05-03T00:00:00.000Z");
  });

  it("does not register tournament debug finalize endpoint in production config", async () => {
    const app = createApp(pool, { ...config, isProduction: true });
    const authResponse = await request(app).post("/auth/anonymous");
    const token = authResponse.body.token as string;

    const debugResponse = await request(app)
      .post("/tournament/debug/finalize-current")
      .set("Authorization", `Bearer ${token}`);
    expect(debugResponse.status).toBe(404);
  });
});
