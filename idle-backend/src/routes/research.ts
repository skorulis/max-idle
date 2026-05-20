import express from "express";
import type { Pool } from "pg";
import {
  changeResearch,
  reconcileResearchProgress,
  startResearch,
  stopResearch,
  type ResearchState
} from "@maxidle/shared/research";
import { getUnlockedLabCount, type ShopState } from "@maxidle/shared/shop";
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
};

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
} | null> {
  const lockClause = forUpdate ? "FOR UPDATE" : "";
  const result = await client.query<ResearchRow>(
    `
    SELECT
      research,
      shop,
      idle_time_available,
      idle_time_total,
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
    idleTimeDelta: reconciled.idleTimeDelta
  };
}

async function persistResearchState(
  client: { query: typeof Pool.prototype.query },
  userId: string,
  research: ResearchState,
  idleTimeDelta: number,
  serverTime: Date
): Promise<void> {
  if (idleTimeDelta === 0) {
    await client.query(
      `
      UPDATE player_states
      SET research = $2::jsonb, updated_at = $3
      WHERE user_id = $1
      `,
      [userId, JSON.stringify(research), serverTime]
    );
    return;
  }

  await client.query(
    `
    UPDATE player_states
    SET
      research = $2::jsonb,
      idle_time_available = GREATEST(0, idle_time_available + $3::BIGINT),
      idle_time_total = CASE WHEN $3::BIGINT > 0 THEN idle_time_total + $3::BIGINT ELSE idle_time_total END,
      updated_at = $4
    WHERE user_id = $1
    `,
    [userId, JSON.stringify(research), idleTimeDelta, serverTime]
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

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const loaded = await loadAndReconcileResearch(client, userId, true, labSpeedMultiplier);
        if (!loaded) {
          await client.query("ROLLBACK");
          res.status(404).json({ error: "Player state not found" });
          return;
        }

        await persistResearchState(
          client,
          userId,
          loaded.research,
          loaded.idleTimeDelta,
          loaded.row.server_time
        );

        await client.query("COMMIT");
        res.json(
          buildResearchResponse(
            loaded.research,
            loaded.row.shop,
            loaded.idleTimeAvailable,
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

        await persistResearchState(
          client,
          userId,
          research,
          loaded.idleTimeDelta + startResult.idleTimeDelta,
          loaded.row.server_time
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

        await persistResearchState(
          client,
          userId,
          research,
          loaded.idleTimeDelta + stopResult.idleTimeDelta,
          loaded.row.server_time
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

        await persistResearchState(
          client,
          userId,
          research,
          loaded.idleTimeDelta + changeResult.idleTimeDelta,
          loaded.row.server_time
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
