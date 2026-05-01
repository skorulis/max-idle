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
    const migrationFiles = ["001_schema.sql", "002_drop_daily_bonuses_bonus_value_check.sql"] as const;
    for (const file of migrationFiles) {
      const sql = await readFile(resolve(process.cwd(), "sql", file), "utf-8");
      await pool.query(sql);
      console.log(`Migration completed: sql/${file}`);
    }

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
