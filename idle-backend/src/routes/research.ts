import express from "express";
import type { Pool } from "pg";
import { ACHIEVEMENT_IDS } from "@maxidle/shared/achievements";
import {
  changeResearch,
  reconcileResearchProgress,
  startResearch,
  stopResearch,
  totalResearchLevelsCompleted,
  type ResearchState
} from "@maxidle/shared/research";
import { getUnlockedLabCount, type ShopState } from "@maxidle/shared/shop";
import {
  getAchievementLevelForValue,
  mergeAchievementLevels,
  normalizeAchievementLevels,
  sumAchievementLevels,
  type AchievementLevelEntry
} from "../achievementUpdates.js";
import { parseResearchState, serializeResearchState } from "../researchState.js";

type RegisterResearchRoutesOptions = {
  app: express.Express;
  pool: Pool;
  resolveIdentity: (req: express.Request) => Promise<{ claims: { sub: string } }>;
  toNumber: (value: unknown) => number;
  labSpeedMultiplier: number;
};

type ResearchRow = {
  research: unknown;
  shop: ShopState;
  idle_time_available: number;
  idle_time_total: number;
  server_time: Date;
  achievement_levels: unknown;
  achievement_count: number;
  has_unseen_achievements: boolean;
};

type ResearchAchievementUpdate = {
  achievementLevels: AchievementLevelEntry[];
  achievementCount: number;
  hasNewAchievement: boolean;
};

function computeLabLevelAchievements(
  research: ResearchState,
  achievementLevels: unknown,
  achievementCount: number,
  serverTime: Date,
  levelsGained: number
): ResearchAchievementUpdate {
  const normalizedAchievementLevels = normalizeAchievementLevels(achievementLevels, serverTime);
  if (levelsGained <= 0) {
    return {
      achievementLevels: normalizedAchievementLevels,
      achievementCount,
      hasNewAchievement: false
    };
  }

  const labLevelsCompleted = totalResearchLevelsCompleted(research);
  const labLevelAchievementLevel = getAchievementLevelForValue(
    ACHIEVEMENT_IDS.LAB_LEVELS_COMPLETED,
    labLevelsCompleted
  );
  const nextAchievementLevels =
    labLevelAchievementLevel > 0
      ? mergeAchievementLevels(
          achievementLevels,
          new Map([[ACHIEVEMENT_IDS.LAB_LEVELS_COMPLETED, labLevelAchievementLevel]]),
          serverTime
        )
      : normalizedAchievementLevels;
  const nextAchievementCount = sumAchievementLevels(nextAchievementLevels);
  return {
    achievementLevels: nextAchievementLevels,
    achievementCount: nextAchievementCount,
    hasNewAchievement: nextAchievementCount > achievementCount
  };
}

export function buildResearchResponse(
  research: ResearchState,
  shop: ShopState,
  idleTimeAvailable: number,
  serverTime: Date
) {
  return {
    research: serializeResearchState(research),
    unlockedLabCount: getUnlockedLabCount(shop),
    idleTimeAvailable,
    serverTime: serverTime.toISOString()
  };
}

async function loadAndReconcileResearch(
  client: { query: typeof Pool.prototype.query },
  userId: string,
  forUpdate: boolean,
  labSpeedMultiplier: number
): Promise<{
  row: ResearchRow;
  research: ResearchState;
  idleTimeAvailable: number;
  idleTimeDelta: number;
  levelsGained: number;
} | null> {
  const lockClause = forUpdate ? "FOR UPDATE" : "";
  const result = await client.query<ResearchRow>(
    `
    SELECT
      research,
      shop,
      idle_time_available,
      idle_time_total,
      achievement_levels,
      achievement_count,
      has_unseen_achievements,
      NOW() AS server_time
    FROM player_states
    WHERE user_id = $1
    ${lockClause}
    `,
    [userId]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const unlockedLabCount = getUnlockedLabCount(row.shop);
  let research = parseResearchState(row.research, row.shop);
  let idleTimeAvailable = row.idle_time_available;
  const serverTimeMs = row.server_time.getTime();

  const reconciled = reconcileResearchProgress({
    research,
    unlockedLabCount,
    serverTimeMs,
    idleTimeAvailable,
    labSpeedMultiplier
  });

  research = reconciled.research;
  idleTimeAvailable += reconciled.idleTimeDelta;

  return {
    row,
    research,
    idleTimeAvailable,
    idleTimeDelta: reconciled.idleTimeDelta,
    levelsGained: reconciled.levelsGained
  };
}

export type ReconciledResearchResult = {
  row: ResearchRow;
  research: ResearchState;
  idleTimeAvailable: number;
};

export async function reconcileAndPersistResearchForUser(
  pool: Pool,
  userId: string,
  labSpeedMultiplier: number,
  toNumber: (value: unknown) => number
): Promise<ReconciledResearchResult | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const loaded = await loadAndReconcileResearch(client, userId, true, labSpeedMultiplier);
    if (!loaded) {
      await client.query("ROLLBACK");
      return null;
    }

    const achievementUpdate = computeLabLevelAchievements(
      loaded.research,
      loaded.row.achievement_levels,
      toNumber(loaded.row.achievement_count),
      loaded.row.server_time,
      loaded.levelsGained
    );

    await persistResearchState(
      client,
      userId,
      loaded.research,
      loaded.idleTimeDelta,
      loaded.row.server_time,
      achievementUpdate.hasNewAchievement ? achievementUpdate : undefined
    );

    await client.query("COMMIT");
    return {
      row: loaded.row,
      research: loaded.research,
      idleTimeAvailable: loaded.idleTimeAvailable
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function persistResearchState(
  client: { query: typeof Pool.prototype.query },
  userId: string,
  research: ResearchState,
  idleTimeDelta: number,
  serverTime: Date,
  achievementUpdate?: ResearchAchievementUpdate
): Promise<void> {
  const params: unknown[] = [userId, JSON.stringify(research)];
  const setClauses = ["research = $2::jsonb"];
  let paramIndex = 3;

  if (idleTimeDelta !== 0) {
    setClauses.push(
      `idle_time_available = GREATEST(0, idle_time_available + $${paramIndex}::BIGINT)`,
      `idle_time_total = CASE WHEN $${paramIndex}::BIGINT > 0 THEN idle_time_total + $${paramIndex}::BIGINT ELSE idle_time_total END`
    );
    params.push(idleTimeDelta);
    paramIndex += 1;
  }

  if (achievementUpdate?.hasNewAchievement) {
    setClauses.push(
      `achievement_levels = $${paramIndex}::jsonb`,
      `achievement_count = $${paramIndex + 1}`,
      `has_unseen_achievements = has_unseen_achievements OR $${paramIndex + 2}::boolean`
    );
    params.push(
      JSON.stringify(achievementUpdate.achievementLevels),
      achievementUpdate.achievementCount,
      true
    );
    paramIndex += 3;
  }

  setClauses.push(`updated_at = $${paramIndex}`);
  params.push(serverTime);

  await client.query(
    `
    UPDATE player_states
    SET ${setClauses.join(", ")}
    WHERE user_id = $1
    `,
    params
  );
}

export function registerResearchRoutes({
  app,
  pool,
  resolveIdentity,
  toNumber,
  labSpeedMultiplier
}: RegisterResearchRoutesOptions): void {
  app.get("/research", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;

      const loaded = await reconcileAndPersistResearchForUser(pool, userId, labSpeedMultiplier, toNumber);
      if (!loaded) {
        res.status(404).json({ error: "Player state not found" });
        return;
      }

      res.json(
        buildResearchResponse(
          loaded.research,
          loaded.row.shop,
          loaded.idleTimeAvailable,
          loaded.row.server_time
        )
      );
    } catch (error) {
      next(error);
    }
  });

  app.post("/research/start", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;
      const labIndex = toNumber(req.body?.labIndex);
      const researchId = String(req.body?.researchId ?? "");

      if (!researchId) {
        res.status(400).json({ error: "researchId is required", code: "RESEARCH_ID_REQUIRED" });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const loaded = await loadAndReconcileResearch(client, userId, true, labSpeedMultiplier);
        if (!loaded) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Player state not found" });
          return;
        }

        let { research, idleTimeAvailable } = loaded;
        const unlockedLabCount = getUnlockedLabCount(loaded.row.shop);
        const serverTimeMs = loaded.row.server_time.getTime();

        const startResult = startResearch({
          research,
          labIndex,
          researchId,
          unlockedLabCount,
          serverTimeMs,
          idleTimeAvailable
        });

        if (!startResult.ok) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Cannot start research", code: startResult.code });
          return;
        }

        research = startResult.research;
        idleTimeAvailable += startResult.idleTimeDelta;

        const achievementUpdate = computeLabLevelAchievements(
          research,
          loaded.row.achievement_levels,
          toNumber(loaded.row.achievement_count),
          loaded.row.server_time,
          loaded.levelsGained
        );

        await persistResearchState(
          client,
          userId,
          research,
          loaded.idleTimeDelta + startResult.idleTimeDelta,
          loaded.row.server_time,
          achievementUpdate.hasNewAchievement ? achievementUpdate : undefined
        );

        await client.query("COMMIT");
        res.json(
          buildResearchResponse(
            research,
            loaded.row.shop,
            idleTimeAvailable,
            loaded.row.server_time
          )
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/research/stop", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;
      const labIndex = toNumber(req.body?.labIndex);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const loaded = await loadAndReconcileResearch(client, userId, true, labSpeedMultiplier);
        if (!loaded) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Player state not found" });
          return;
        }

        let { research, idleTimeAvailable } = loaded;
        const unlockedLabCount = getUnlockedLabCount(loaded.row.shop);

        const stopResult = stopResearch({
          research,
          labIndex,
          unlockedLabCount,
          serverTimeMs: loaded.row.server_time.getTime()
        });

        if (!stopResult.ok) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Cannot stop research", code: stopResult.code });
          return;
        }

        research = stopResult.research;
        idleTimeAvailable += stopResult.idleTimeDelta;

        const achievementUpdate = computeLabLevelAchievements(
          research,
          loaded.row.achievement_levels,
          toNumber(loaded.row.achievement_count),
          loaded.row.server_time,
          loaded.levelsGained
        );

        await persistResearchState(
          client,
          userId,
          research,
          loaded.idleTimeDelta + stopResult.idleTimeDelta,
          loaded.row.server_time,
          achievementUpdate.hasNewAchievement ? achievementUpdate : undefined
        );

        await client.query("COMMIT");
        res.json(
          buildResearchResponse(
            research,
            loaded.row.shop,
            idleTimeAvailable,
            loaded.row.server_time
          )
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  });

  app.post("/research/change", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;
      const labIndex = toNumber(req.body?.labIndex);
      const researchId = String(req.body?.researchId ?? "");

      if (!researchId) {
        res.status(400).json({ error: "researchId is required", code: "RESEARCH_ID_REQUIRED" });
        return;
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const loaded = await loadAndReconcileResearch(client, userId, true, labSpeedMultiplier);
        if (!loaded) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Player state not found" });
          return;
        }

        let { research, idleTimeAvailable } = loaded;
        const unlockedLabCount = getUnlockedLabCount(loaded.row.shop);
        const serverTimeMs = loaded.row.server_time.getTime();

        const changeResult = changeResearch({
          research,
          labIndex,
          researchId,
          unlockedLabCount,
          serverTimeMs,
          idleTimeAvailable
        });

        if (!changeResult.ok) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Cannot change research", code: changeResult.code });
          return;
        }

        research = changeResult.research;
        idleTimeAvailable += changeResult.idleTimeDelta;

        const achievementUpdate = computeLabLevelAchievements(
          research,
          loaded.row.achievement_levels,
          toNumber(loaded.row.achievement_count),
          loaded.row.server_time,
          loaded.levelsGained
        );

        await persistResearchState(
          client,
          userId,
          research,
          loaded.idleTimeDelta + changeResult.idleTimeDelta,
          loaded.row.server_time,
          achievementUpdate.hasNewAchievement ? achievementUpdate : undefined
        );

        await client.query("COMMIT");
        res.json(
          buildResearchResponse(
            research,
            loaded.row.shop,
            idleTimeAvailable,
            loaded.row.server_time
          )
        );
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      next(error);
    }
  });
}
