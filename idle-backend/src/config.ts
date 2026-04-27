import "dotenv/config";
import type { AppConfig } from "./types.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function optionalTrimmedEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function assertValidVapidConfiguration(config: {
  vapidPublicKey?: string;
  vapidPrivateKey?: string;
  vapidSubject?: string;
}): void {
  const values = [config.vapidPublicKey, config.vapidPrivateKey, config.vapidSubject];
  const providedCount = values.filter(Boolean).length;
  if (providedCount > 0 && providedCount < 3) {
    throw new Error(
      "Invalid VAPID configuration: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must all be set together."
    );
  }
  if (providedCount === 0) {
    return;
  }

  const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
  if (!base64UrlPattern.test(config.vapidPublicKey!)) {
    throw new Error("Invalid VAPID_PUBLIC_KEY format. Expected a base64url string.");
  }
  if (!base64UrlPattern.test(config.vapidPrivateKey!)) {
    throw new Error("Invalid VAPID_PRIVATE_KEY format. Expected a base64url string.");
  }
  if (!(config.vapidSubject!.startsWith("mailto:") || config.vapidSubject!.startsWith("https://"))) {
    throw new Error("Invalid VAPID_SUBJECT format. Expected mailto: or https:// value.");
  }
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("PORT must be a positive number");
  }

  const vapidPublicKey = optionalTrimmedEnv("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = optionalTrimmedEnv("VAPID_PRIVATE_KEY");
  const vapidSubject = optionalTrimmedEnv("VAPID_SUBJECT");
  assertValidVapidConfiguration({ vapidPublicKey, vapidPrivateKey, vapidSubject });

  return {
    port,
    isProduction: process.env.NODE_ENV === "production",
    databaseUrl: requiredEnv("DATABASE_URL"),
    jwtSecret: requiredEnv("JWT_SECRET"),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    betterAuthSecret: requiredEnv("BETTER_AUTH_SECRET"),
    betterAuthUrl: requiredEnv("BETTER_AUTH_URL"),
    vapidPublicKey,
    vapidPrivateKey,
    vapidSubject,
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    appleClientId: process.env.APPLE_CLIENT_ID,
    appleClientSecret: process.env.APPLE_CLIENT_SECRET
  };
}
