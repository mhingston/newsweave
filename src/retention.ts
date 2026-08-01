import type { Pool } from "pg";

export async function deleteExpired(pool: Pool, retentionDays: number): Promise<number> {
  const result = await pool.query(
    `WITH removed AS (
       DELETE FROM items WHERE created_at < now() - ($1::int * interval '1 day') RETURNING id
     ) SELECT count(*)::int AS count FROM removed`,
    [retentionDays],
  );
  await pool.query("DELETE FROM source_entries WHERE created_at < now() - ($1::int * interval '1 day')", [retentionDays]);
  return Number(result.rows[0]?.count ?? 0);
}
