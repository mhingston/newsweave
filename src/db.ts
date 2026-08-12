import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";

export function createPool(databaseUrl: string): Pool {
  return new Pool({ connectionString: databaseUrl, max: 8 });
}

export async function migrate(pool: Pool): Promise<void> {
  for (const migration of ["001_initial.sql", "002_digests.sql", "003_digest_selection.sql", "004_feedback.sql"]) {
    const filename = fileURLToPath(new URL(`../migrations/${migration}`, import.meta.url));
    await pool.query(await readFile(filename, "utf8"));
  }
}

export async function withAdvisoryLock<T>(pool: Pool, name: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [name]);
    return await fn(client);
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtext($1))", [name]); } finally { client.release(); }
  }
}
