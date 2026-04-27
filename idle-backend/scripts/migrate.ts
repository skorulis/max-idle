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
    const currencySql = await readFile(resolve(process.cwd(), "sql/002_player_time_currencies.sql"), "utf-8");
    await pool.query(currencySql);
    console.log("Migration completed: 002_player_time_currencies.sql");
    const authIdentityLinkSql = await readFile(resolve(process.cwd(), "sql/003_auth_identities_multi_link.sql"), "utf-8");
    await pool.query(authIdentityLinkSql);
    console.log("Migration completed: 003_auth_identities_multi_link.sql");
    const usersEmailUniqueSql = await readFile(resolve(process.cwd(), "sql/004_users_email_unique.sql"), "utf-8");
    await pool.query(usersEmailUniqueSql);
    console.log("Migration completed: 004_users_email_unique.sql");
    const tournamentsSql = await readFile(resolve(process.cwd(), "sql/005_tournaments.sql"), "utf-8");
    await pool.query(tournamentsSql);
    console.log("Migration completed: 005_tournaments.sql");
    const pushSubscriptionsSql = await readFile(resolve(process.cwd(), "sql/007_push_subscriptions.sql"), "utf-8");
    await pool.query(pushSubscriptionsSql);
    console.log("Migration completed: 007_push_subscriptions.sql");
    await pool.query(`
      ALTER TABLE player_states
      ADD COLUMN IF NOT EXISTS achievement_count BIGINT NOT NULL DEFAULT 0
    `);
    await pool.query(`
      ALTER TABLE player_states
      ADD COLUMN IF NOT EXISTS completed_achievements JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
    await pool.query(`
      ALTER TABLE player_states
      ADD COLUMN IF NOT EXISTS last_daily_reward_collected_at TIMESTAMPTZ
    `);
    console.log("Migration completed: achievements columns");

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
