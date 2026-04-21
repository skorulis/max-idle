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
    const baseSql = await readFile(resolve(process.cwd(), "sql/001_init.sql"), "utf-8");
    const authIdentitySql = await readFile(resolve(process.cwd(), "sql/002_auth_identity.sql"), "utf-8");
    const usernameSql = await readFile(resolve(process.cwd(), "sql/003_username.sql"), "utf-8");
    const playerStateFieldsSql = await readFile(resolve(process.cwd(), "sql/004_player_state_fields.sql"), "utf-8");
    await pool.query(baseSql);
    await pool.query(authIdentitySql);
    await pool.query(usernameSql);
    const legacyColumnResult = await pool.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'player_states'
          AND column_name = 'total_idle_seconds'
      ) AS exists
      `
    );
    if (legacyColumnResult.rows[0]?.exists) {
      await pool.query(playerStateFieldsSql);
    }
    console.log("Migration completed: 001_init.sql + 002_auth_identity.sql + 003_username.sql + 004_player_state_fields.sql");

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
