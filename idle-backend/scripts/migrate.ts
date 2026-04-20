import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Pool } from "pg";

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sqlPath = resolve(process.cwd(), "sql/001_init.sql");
  const sql = await readFile(sqlPath, "utf-8");

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(sql);
    console.log("Migration completed: 001_init.sql");
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
