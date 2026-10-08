import path from "node:path";
import fs from "node:fs";
import { pool } from "../lib/db.js";
import { logger } from "../lib/logger.js";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

const CREATE_MIGRATIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

type MigrationRow = {
  name: string;
};

async function getExecutedMigrations(): Promise<string[]> {
  const result = await pool.query<MigrationRow>(
    "SELECT name FROM migrations ORDER BY name"
  );
  return result.rows.map((row: MigrationRow) => row.name);
}

function getMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

async function runMigration(fileName: string): Promise<void> {
  const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, fileName), "utf-8");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO migrations (name) VALUES ($1)", [fileName]);
    await client.query("COMMIT");

    logger.info(`Migration ${fileName} executed successfully.`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function migrate(): Promise<void> {
  await pool.query(CREATE_MIGRATIONS_TABLE_SQL);

  const executed = new Set(await getExecutedMigrations());
  const pending = getMigrationFiles().filter((file) => !executed.has(file));

  if (pending.length === 0) {
    logger.info("No pending migrations.");
    return;
  }

  for (const fileName of pending) {
    await runMigration(fileName);
  }
  logger.info("All pending migrations executed successfully.");
}

migrate()
  .catch((error) => {
    logger.error("Migration failed:", error);
    process.exit(1);
  })
  .finally(() => pool.end());