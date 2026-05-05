import { useMemo, useState } from "react";
import { deletePushSubscription, getPushConfig, upsertPushSubscription } from "./api";

const DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY = "max-idle-daily-reward-notifications-enabled";

function isDailyRewardNotificationsEnabledStored(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return localStorage.getItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY) === "true";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isValidPushSubscription(
  subscriptionJson: PushSubscriptionJSON
): subscriptionJson is { endpoint: string; keys: { p256dh: string; auth: string } } {
  return Boolean(subscriptionJson.endpoint && subscriptionJson.keys?.p256dh && subscriptionJson.keys?.auth);
}

function isLikelyValidVapidPublicKey(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const decoded = window.atob(padded);
    return decoded.length === 65 && decoded.charCodeAt(0) === 4;
  } catch {
    return false;
  }
}

async function getActivePushServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existingRegistration = await navigator.serviceWorker.getRegistration("/push-sw.js");
  if (existingRegistration?.active) {
    return existingRegistration;
  }
  await navigator.serviceWorker.register("/push-sw.js");
  return navigator.serviceWorker.ready;
}

type UseDailyRewardNotificationsParams = {
  token: string | null;
  setError: (message: string | null) => void;
  setStatus: (message: string) => void;
};

export function useDailyRewardNotifications({ token, setError, setStatus }: UseDailyRewardNotificationsParams) {
  const [dailyRewardNotificationsEnabled, setDailyRewardNotificationsEnabled] = useState(() =>
    isDailyRewardNotificationsEnabledStored()
  );
  const [dailyRewardNotificationPermissionPending, setDailyRewardNotificationPermissionPending] = useState(false);

  const dailyRewardNotificationsSupported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window,
    []
  );

  const dailyRewardNotificationPermission: NotificationPermission | "unsupported" = dailyRewardNotificationsSupported
    ? Notification.permission
    : "unsupported";

  const onToggleDailyRewardNotifications = async (enabled: boolean) => {
    if (!dailyRewardNotificationsSupported) {
      setError("Push notifications are not supported on this device.");
      return;
    }
    if (!enabled) {
      try {
        setDailyRewardNotificationPermissionPending(true);
        const serviceWorkerRegistration = await navigator.serviceWorker.getRegistration("/push-sw.js");
        const existingSubscription = await serviceWorkerRegistration?.pushManager.getSubscription();
        if (existingSubscription?.endpoint) {
          await deletePushSubscription(token, existingSubscription.endpoint).catch(() => {
            // Keep UX responsive if backend cleanup fails.
          });
        }
        await existingSubscription?.unsubscribe();
        setDailyRewardNotificationsEnabled(false);
        localStorage.setItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY, "false");
        setStatus("Daily reward notifications disabled.");
        setError(null);
      } finally {
        setDailyRewardNotificationPermissionPending(false);
      }
      return;
    }

    try {
      setDailyRewardNotificationPermissionPending(true);
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDailyRewardNotificationsEnabled(false);
        localStorage.setItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY, "false");
        setError("Enable browser notifications to receive daily reward alerts.");
        return;
      }
      const config = await getPushConfig();
      if (!isLikelyValidVapidPublicKey(config.vapidPublicKey)) {
        throw new Error("INVALID_VAPID_PUBLIC_KEY");
      }
      const serviceWorkerRegistration = await getActivePushServiceWorkerRegistration();
      const existingSubscription = await serviceWorkerRegistration.pushManager.getSubscription();
      const pushSubscription =
        existingSubscription ??
        (await serviceWorkerRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey) as BufferSource
        }));
      const subscriptionJson = pushSubscription.toJSON();
      if (!isValidPushSubscription(subscriptionJson)) {
        throw new Error("Failed to create push subscription");
      }
      await upsertPushSubscription(token, {
        endpoint: subscriptionJson.endpoint,
        keys: {
          p256dh: subscriptionJson.keys.p256dh,
          auth: subscriptionJson.keys.auth
        }
      });
      setDailyRewardNotificationsEnabled(true);
      localStorage.setItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY, "true");
      setStatus("Daily reward notifications enabled.");
      setError(null);
    } catch (notificationError) {
      setDailyRewardNotificationsEnabled(false);
      localStorage.setItem(DAILY_REWARD_NOTIFICATIONS_ENABLED_KEY, "false");
      const message = notificationError instanceof Error ? notificationError.message : "Could not enable daily reward notifications.";
      if (message === "INVALID_VAPID_PUBLIC_KEY") {
        setError("Push registration failed. Check backend VAPID keys and regenerate them as a matching pair.");
      } else if (message.toLowerCase().includes("push service error")) {
        setError(
          "Push service is unavailable in this browser profile right now. Localhost is supported; try reloading, re-enabling notifications, and checking browser push/privacy settings."
        );
      } else {
        setError(message);
      }
    } finally {
      setDailyRewardNotificationPermissionPending(false);
    }
  };

  return {
    dailyRewardNotificationsSupported,
    dailyRewardNotificationPermission,
    dailyRewardNotificationsEnabled,
    dailyRewardNotificationPermissionPending,
    onToggleDailyRewardNotifications
  };
}
