import type { PoolClient } from "pg";
import { parseStringSet, type Config } from "./config.js";
import type { MinifluxEntry } from "./miniflux.js";
import { extractLinks, isYouTubeShort, normalizeUrl } from "./links.js";

export interface IngestStats { entries: number; newEntries: number; items: number; childLinks: number; duplicates: number; }

function isFanout(entry: MinifluxEntry, config: Config): boolean {
  return parseStringSet(config.FANOUT_FEED_IDS).has(String(entry.feedId)) ||
    parseStringSet(config.FANOUT_FEED_TITLES).has(entry.feedTitle.trim().toLowerCase());
}

export async function ingestEntries(client: PoolClient, entries: MinifluxEntry[], config: Config): Promise<IngestStats> {
  const stats: IngestStats = { entries: entries.length, newEntries: 0, items: 0, childLinks: 0, duplicates: 0 };
  for (const entry of entries) {
    await client.query("BEGIN");
    try {
      const fanout = isFanout(entry, config);
      const source = await client.query<{ id: string }>(
        `INSERT INTO source_entries
          (miniflux_entry_id, feed_id, feed_title, category_title, title, url, content_html, published_at, is_fanout)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (miniflux_entry_id) DO NOTHING RETURNING id`,
        [entry.id, entry.feedId, entry.feedTitle, entry.categoryTitle ?? null, entry.title, entry.url, entry.contentHtml, entry.publishedAt ?? null, fanout],
      );
      const sourceId = source.rows[0]?.id;
      if (!sourceId) { stats.duplicates++; await client.query("UPDATE ingestion_state SET last_entry_id=$1, updated_at=now() WHERE id=TRUE", [entry.id]); await client.query("COMMIT"); continue; }
      stats.newEntries++;
      const links = fanout ? extractLinks(entry.contentHtml, entry.url) : (isYouTubeShort(entry.url) ? [] : [normalizeUrl(entry.url)]);
      if (fanout) stats.childLinks += links.length;
      for (const url of links) {
        const kind = fanout ? "fanout" : "rss";
        const host = new URL(url).hostname;
        const item = await client.query<{ id: string }>(
          `INSERT INTO items
            (canonical_url, url, title, kind, parent_source_entry_id, feed_id, feed_title, category_title, publisher_host)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (canonical_url) DO UPDATE SET updated_at=now() RETURNING id`,
          [url, url, fanout ? url : entry.title, kind, fanout ? sourceId : null, entry.feedId, entry.feedTitle, entry.categoryTitle ?? null, host],
        );
        const itemId = item.rows[0]?.id;
        if (!itemId) continue;
        const ref = await client.query(
          `INSERT INTO item_sources (item_id, source_entry_id, source_url, source_title, is_primary)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [itemId, sourceId, entry.url, entry.title, !fanout],
        );
        if (ref.rowCount === 1) stats.items++;
      }
      await client.query("INSERT INTO ingestion_state (id,last_entry_id) VALUES (TRUE,$1) ON CONFLICT (id) DO UPDATE SET last_entry_id=EXCLUDED.last_entry_id, updated_at=now()", [entry.id]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  return stats;
}

export async function activateConfiguredFanout(client: PoolClient, config: Config): Promise<{ feeds: number; entries: number; childLinks: number; items: number }> {
  const ids = parseStringSet(config.FANOUT_FEED_IDS);
  const titles = parseStringSet(config.FANOUT_FEED_TITLES);
  const result = await client.query<{ id: string; feed_id: string; feed_title: string; title: string; url: string; content_html: string }>(
    "SELECT id, feed_id, feed_title, title, url, content_html FROM source_entries WHERE is_fanout=FALSE",
  );
  const stats = { feeds: new Set<string>(), entries: 0, childLinks: 0, items: 0 };
  for (const entry of result.rows) {
    if (!ids.has(String(entry.feed_id)) && !titles.has(entry.feed_title.trim().toLowerCase())) continue;
    stats.feeds.add(String(entry.feed_id));
    const links = extractLinks(entry.content_html ?? "", entry.url);
    await client.query("UPDATE source_entries SET is_fanout=TRUE WHERE id=$1", [entry.id]);
    stats.entries++;
    stats.childLinks += links.length;
    for (const url of links) {
      const item = await client.query<{ id: string }>(
        `INSERT INTO items (canonical_url,url,title,kind,parent_source_entry_id,feed_id,feed_title,category_title,publisher_host)
         SELECT $1,$1,$2,'fanout',$3,feed_id,feed_title,category_title,split_part(regexp_replace($1,'^https?://',''),'/',1)
         FROM source_entries WHERE id=$3
         ON CONFLICT (canonical_url) DO UPDATE SET updated_at=now() RETURNING id`,
        [url, url, entry.id],
      );
      const itemId = item.rows[0]?.id;
      if (!itemId) continue;
      const ref = await client.query(
        `INSERT INTO item_sources (item_id,source_entry_id,source_url,source_title,is_primary) VALUES ($1,$2,$3,$4,FALSE) ON CONFLICT DO NOTHING`,
        [itemId, entry.id, entry.url, entry.title],
      );
      if (ref.rowCount === 1) stats.items++;
    }
  }
  return { ...stats, feeds: stats.feeds.size };
}
