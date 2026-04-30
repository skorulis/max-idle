import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DataType, newDb } from "pg-mem";
import type { Pool } from "pg";

export async function createTestPool(): Promise<Pool> {
  const db = newDb({
    autoCreateForeignKeyIndices: true
  });
  db.public.registerFunction({
    name: "jsonb_typeof",
    args: [DataType.jsonb],
    returns: DataType.text,
    implementation: (value: unknown): string => {
      if (Array.isArray(value)) {
        return "array";
      }
      if (value === null) {
        return "null";
      }
      if (typeof value === "string") {
        return "string";
      }
      if (typeof value === "number") {
        return "number";
      }
      if (typeof value === "boolean") {
        return "boolean";
      }
      if (typeof value === "object") {
        return "object";
      }
      return "null";
    }
  });
  db.public.registerFunction({
    name: "jsonb_path_exists",
    args: [DataType.jsonb, DataType.text],
    returns: DataType.bool,
    implementation: (value: unknown): boolean => {
      if (!Array.isArray(value)) {
        return false;
      }
      return value.some((entry) => {
        if (typeof entry === "string") {
          return false;
        }
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return true;
        }
        const row = entry as { id?: unknown; grantedAt?: unknown };
        return typeof row.id !== "string" || typeof row.grantedAt !== "string";
      });
    }
  });

  const { Pool: MemPool } = db.adapters.createPg();
  const pool = new MemPool() as unknown as Pool;

  const schemaSql = readFileSync(resolve(process.cwd(), "sql/001_schema.sql"), "utf-8");
  const betterAuthSql = `
    CREATE TABLE IF NOT EXISTS "user" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
      image TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "session" (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "account" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
      "accountId" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "accessToken" TEXT,
      "refreshToken" TEXT,
      "idToken" TEXT,
      "accessTokenExpiresAt" TIMESTAMPTZ,
      "refreshTokenExpiresAt" TIMESTAMPTZ,
      scope TEXT,
      password TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("providerId", "accountId")
    );

    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      "expiresAt" TIMESTAMPTZ NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;
  await pool.query(schemaSql);
  await pool.query(betterAuthSql);
  return pool;
}
