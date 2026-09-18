import { loadConfig } from "./config.js";
import { createPool, migrate, withAdvisoryLock } from "./db.js";
import { createMinifluxClient } from "./miniflux.js";
import { activateFanout, ingestEntries } from "./ingest.js";
import { deleteExpired } from "./retention.js";
import { processPending } from "./process.js";
import { publish } from "./publish.js";
import { findFanoutCandidates } from "./candidates.js";
import { syncEngagement } from "./engagement.js";

const command = process.argv[2] ?? "help";

if (command === "help") {
  console.log("newsweave ingest|fanout|process|publish|engagement|retention|doctor|metrics|candidates|downvote <item-url-or-id>");
  process.exit(0);
}

try {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL);
  await migrate(pool);

  if (command === "ingest") {
    const result = await withAdvisoryLock(pool, "newsweave:ingest", async (client) => {
      const cursor = await client.query<{ last_entry_id: string }>("SELECT last_entry_id FROM ingestion_state WHERE id=TRUE");
      const after = Number(cursor.rows[0]?.last_entry_id ?? 0);
      const miniflux = createMinifluxClient({ baseUrl: config.MINIFLUX_URL, token: config.MINIFLUX_API_TOKEN });
      const entries = await miniflux.listEntries(after);
      const stats = await ingestEntries(client, entries, config);
      await miniflux.markEntriesRead(entries.map((entry) => entry.id));
      return { ...stats, markedRead: entries.length };
    });
    console.log(JSON.stringify({ command, ...result }));
  } else if (command === "fanout") {
    const result = await withAdvisoryLock(pool, "newsweave:fanout", async (client) => activateFanout(client, config));
    console.log(JSON.stringify({ command, ...result }));
  } else if (command === "retention") {
    const deleted = await withAdvisoryLock(pool, "newsweave:retention", async () => deleteExpired(pool, config.RETENTION_DAYS));
    console.log(JSON.stringify({ command, deleted, retentionDays: config.RETENTION_DAYS }));
  } else if (command === "process") {
    const requestedLimit = process.argv[3] ? Number(process.argv[3]) : Number.POSITIVE_INFINITY;
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : Number.POSITIVE_INFINITY;
    const result = await withAdvisoryLock(pool, "newsweave:process", async () => processPending(pool, config, limit));
    console.log(JSON.stringify({ command, ...result }));
  } else if (command === "publish") {
    const result = await withAdvisoryLock(pool, "newsweave:publish", async () => publish(pool, config));
    console.log(JSON.stringify({ command, ...result }));
  } else if (command === "engagement") {
    const result = await withAdvisoryLock(pool, "newsweave:engagement", async () => syncEngagement(pool, config));
    console.log(JSON.stringify({ command, ...result }));
  } else if (command === "doctor") {
    await pool.query("SELECT 1");
    const state = await pool.query("SELECT last_entry_id FROM ingestion_state WHERE id=TRUE");
    console.log(JSON.stringify({ command, database: "ok", miniflux: config.MINIFLUX_URL, cursor: state.rows[0]?.last_entry_id ?? 0 }));
  } else if (command === "candidates") {
    console.log(JSON.stringify(await findFanoutCandidates(pool), null, 2));
  } else if (command === "metrics") {
    const statuses = await pool.query<{ status: string; count: string }>("SELECT status, count(*)::int AS count FROM items GROUP BY status ORDER BY status");
    const digest = await pool.query("SELECT digest_date, status, item_count, sent_at FROM digests ORDER BY digest_date DESC LIMIT 1");
    console.log(JSON.stringify({ command, items: Object.fromEntries(statuses.rows.map((row) => [row.status, Number(row.count)])), latestDigest: digest.rows[0] ?? null }, null, 2));
  } else if (command === "downvote") {
    const target = process.argv[3];
    if (!target) throw new Error("usage: newsweave downvote <item-url-or-id>");
    const item = await pool.query<{ id: string; title: string; url: string }>(
      "SELECT id,title,url FROM items WHERE id::text=$1 OR url=$1 LIMIT 1", [target],
    );
    if (!item.rows[0]) throw new Error(`item not found: ${target}`);
    await pool.query("INSERT INTO item_feedback (item_id,feedback_kind) VALUES ($1,'downvote') ON CONFLICT DO NOTHING", [item.rows[0].id]);
    console.log(JSON.stringify({ command, feedback: "downvote", item: item.rows[0] }));
  } else {
    console.log(`Newsweave command '${command}' is not implemented yet.`);
  }
  await pool.end();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
