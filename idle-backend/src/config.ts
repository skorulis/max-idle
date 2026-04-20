import "dotenv/config";
import type { AppConfig } from "./types";

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
    jwtSecret: requiredEnv("JWT_SECRET")
  };
}
