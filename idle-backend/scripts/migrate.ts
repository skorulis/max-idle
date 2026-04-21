import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";
import { getMigrations } from "better-auth/db/migration";
import { loadConfig } from "../src/config.js";
import { createBetterAuth } from "../src/betterAuth.js";

async function run(): Promise<void> {
  const config = loadConfig();

  const pool = new Pool({ connectionString: config.databaseUrl });
  try {
    const schemaSql = await readFile(resolve(process.cwd(), "sql/001_init.sql"), "utf-8");
    await pool.query(schemaSql);
    console.log("Migration completed: 001_init.sql");

    const auth = createBetterAuth(pool, config);
    const migrations = await getMigrations(auth.options);
    await migrations.runMigrations();
    console.log("Better Auth migrations completed");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
