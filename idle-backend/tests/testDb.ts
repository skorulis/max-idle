import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { newDb } from "pg-mem";
import type { Pool } from "pg";

export async function createTestPool(): Promise<Pool> {
  const db = newDb({
    autoCreateForeignKeyIndices: true
  });

  const { Pool: MemPool } = db.adapters.createPg();
  const pool = new MemPool() as unknown as Pool;

  const schemaSql = readFileSync(resolve(process.cwd(), "sql/001_init.sql"), "utf-8");
  await pool.query(schemaSql);
  return pool;
}
