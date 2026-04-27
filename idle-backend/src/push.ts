import type { Pool } from "pg";
import webpush from "web-push";

type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type PushConfig = {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
};

function getCurrentUtcDayStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function isPushConfigured(config: PushConfig): boolean {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey && config.vapidSubject);
}

export function configureWebPush(config: PushConfig): void {
  if (!isPushConfigured(config)) {
    return;
  }
  try {
    webpush.setVapidDetails(config.vapidSubject!, config.vapidPublicKey!, config.vapidPrivateKey!);
  } catch (error) {
    throw new Error(
      `Invalid VAPID configuration for web push: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

export async function sendDueDailyRewardPushNotifications(pool: Pool): Promise<number> {
  const now = new Date();
  const currentUtcDayStart = getCurrentUtcDayStart(now);
  const dueSubscriptionsResult = await pool.query<PushSubscriptionRow & { user_id: string }>(
    `
    SELECT
      ps.user_id,
      ps.endpoint,
      ps.p256dh,
      ps.auth
    FROM push_subscriptions ps
    INNER JOIN player_states player_state ON player_state.user_id = ps.user_id
    WHERE
      (player_state.last_daily_reward_collected_at IS NULL OR player_state.last_daily_reward_collected_at < $1)
      AND (ps.last_daily_reward_notified_day_start IS NULL OR ps.last_daily_reward_notified_day_start < $1)
    `,
    [currentUtcDayStart]
  );

  if (dueSubscriptionsResult.rows.length === 0) {
    return 0;
  }

  let sentCount = 0;
  for (const row of dueSubscriptionsResult.rows) {
    const subscription = {
      endpoint: row.endpoint,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth
      }
    };
    const payload = JSON.stringify({
      title: "Daily reward ready",
      body: "Your +1 Time Gem daily reward is ready to collect in Max Idle.",
      tag: "max-idle-daily-reward",
      url: "/"
    });

    try {
      await webpush.sendNotification(subscription, payload);
      await pool.query(
        `
        UPDATE push_subscriptions
        SET
          last_daily_reward_notified_day_start = $2,
          updated_at = NOW()
        WHERE user_id = $1 AND endpoint = $3
        `,
        [row.user_id, currentUtcDayStart, row.endpoint]
      );
      sentCount += 1;
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await pool.query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [row.user_id, row.endpoint]);
        continue;
      }
      console.error("Failed to send daily reward push notification", error);
    }
  }

  return sentCount;
}
