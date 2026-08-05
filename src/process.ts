import type { Pool, PoolClient } from "pg";
import type { Config } from "./config.js";
import { extractContent } from "./extractor.js";
import { summarize } from "./summarizer.js";

interface PendingItem { id: string; url: string; title: string; attempts: number; }

async function recoverStale(pool: Pool, maxAttempts: number): Promise<void> {
  await pool.query(
    `UPDATE items SET status=CASE WHEN attempts >= $1 THEN 'failed' ELSE 'pending' END, last_error=coalesce(last_error,'stale processing lease recovered'), updated_at=now()
     WHERE status='processing' AND updated_at < now() - interval '30 minutes'`,
    [maxAttempts],
  );
}

async function excludeQueuedShorts(pool: Pool): Promise<void> {
  await pool.query(
    `UPDATE items SET status='failed', last_error='Excluded: YouTube Short', updated_at=now()
     WHERE status='pending' AND url ILIKE ANY($1::text[])`,
    [["%youtube.com/shorts/%", "%m.youtube.com/shorts/%", "%youtube-nocookie.com/shorts/%"]],
  );
}

async function claim(client: PoolClient): Promise<PendingItem | undefined> {
  const result = await client.query<PendingItem>(
    `WITH next_item AS (
       SELECT id FROM items WHERE status='pending' AND url NOT ILIKE ALL($1::text[]) ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE items SET status='processing', attempts=attempts+1, updated_at=now()
     WHERE id IN (SELECT id FROM next_item)
     RETURNING id, url, title, attempts`,
    [["%youtube.com/shorts/%", "%m.youtube.com/shorts/%", "%youtube-nocookie.com/shorts/%"]],
  );
  return result.rows[0];
}

export async function processPending(pool: Pool, config: Config, limit = Number.POSITIVE_INFINITY): Promise<{ processed: number; summarized: number; failed: number }> {
  const stats = { processed: 0, summarized: 0, failed: 0 };
  await recoverStale(pool, config.RETRY_MAX_ATTEMPTS);
  await excludeQueuedShorts(pool);
  for (; stats.processed < limit;) {
    const client = await pool.connect();
    let item: PendingItem | undefined;
    try { item = await claim(client); } finally { client.release(); }
    if (!item) break;
    stats.processed++;
    try {
      const extracted = await extractContent(config, item);
      const result = await summarize(config, { title: extracted.title, url: item.url, text: extracted.text });
      await pool.query(
        `UPDATE items SET title=$2, content_text=$3, summary=$4, status='summarized', last_error=NULL, updated_at=now() WHERE id=$1`,
        [item.id, extracted.title, extracted.text, JSON.stringify(result)],
      );
      stats.summarized++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await pool.query(
        `UPDATE items SET status=CASE WHEN attempts >= $2 THEN 'failed' ELSE 'pending' END, last_error=$3, updated_at=now() WHERE id=$1`,
        [item.id, config.RETRY_MAX_ATTEMPTS, message.slice(0, 2000)],
      );
      stats.failed++;
    }
  }
  return stats;
}
