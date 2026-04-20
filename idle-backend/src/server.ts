import { createApp } from "./app";
import { loadConfig } from "./config";
import { createPool } from "./db";

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = createPool(config.databaseUrl);
  const app = createApp(pool, config.jwtSecret);

  const server = app.listen(config.port, () => {
    console.log(`idle-backend listening on port ${config.port}`);
  });

  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
