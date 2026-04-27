import express from "express";
import type { Pool } from "pg";
import type { AppConfig, AuthClaims } from "../types.js";

type NotificationsRouteIdentity = {
  claims: AuthClaims;
};

type RegisterNotificationsRoutesOptions = {
  app: express.Express;
  pool: Pool;
  config: AppConfig;
  resolveIdentity: (req: express.Request) => Promise<NotificationsRouteIdentity>;
};

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

function toSubscriptionBody(body: unknown): SubscriptionBody {
  if (!body || typeof body !== "object") {
    return {};
  }
  return body as SubscriptionBody;
}

export function registerNotificationRoutes({
  app,
  pool,
  config,
  resolveIdentity
}: RegisterNotificationsRoutesOptions): void {
  app.get("/notifications/push-config", (_req, res) => {
    if (!config.vapidPublicKey) {
      res.status(503).json({ error: "Push notifications are not configured" });
      return;
    }
    res.json({ vapidPublicKey: config.vapidPublicKey });
  });

  app.post("/notifications/push-subscription", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;
      const body = toSubscriptionBody(req.body);
      const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
      const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
      const auth = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : "";

      if (!endpoint || !p256dh || !auth) {
        res.status(400).json({ error: "Invalid push subscription payload" });
        return;
      }

      await pool.query(
        `
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id, endpoint)
        DO UPDATE SET
          p256dh = EXCLUDED.p256dh,
          auth = EXCLUDED.auth,
          updated_at = NOW()
        `,
        [userId, endpoint, p256dh, auth]
      );

      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.delete("/notifications/push-subscription", async (req, res, next) => {
    try {
      const identity = await resolveIdentity(req);
      const userId = identity.claims.sub;
      const body = toSubscriptionBody(req.body);
      const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
      if (!endpoint) {
        res.status(400).json({ error: "Endpoint is required" });
        return;
      }

      await pool.query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [userId, endpoint]);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}
