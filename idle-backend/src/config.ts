import "dotenv/config";
import type { AppConfig } from "./types.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const port = Number(process.env.PORT ?? "3000");
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("PORT must be a positive number");
  }

  return {
    port,
    databaseUrl: requiredEnv("DATABASE_URL"),
    jwtSecret: requiredEnv("JWT_SECRET"),
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    betterAuthSecret: requiredEnv("BETTER_AUTH_SECRET"),
    betterAuthUrl: requiredEnv("BETTER_AUTH_URL"),
    googleClientId: process.env.GOOGLE_CLIENT_ID,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
    appleClientId: process.env.APPLE_CLIENT_ID,
    appleClientSecret: process.env.APPLE_CLIENT_SECRET
  };
}
