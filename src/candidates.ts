import type { Pool } from "pg";
import { extractLinks } from "./links.js";

export interface FanoutCandidate {
  feedId: string;
  feedTitle: string;
  entries: number;
  likelyEntries: number;
  averageLinks: number;
  maxLinks: number;
  reason: string[];
}

export async function findFanoutCandidates(pool: Pool): Promise<FanoutCandidate[]> {
  const result = await pool.query<{ feed_id: string; feed_title: string; title: string; url: string; content_html: string }>(
    "SELECT feed_id, feed_title, title, url, content_html FROM source_entries WHERE is_fanout=FALSE ORDER BY feed_id, created_at",
  );
  const grouped = new Map<string, { title: string; links: number[]; likely: number }>();
  for (const entry of result.rows) {
    const key = entry.feed_id;
    const state = grouped.get(key) ?? { title: entry.feed_title, links: [], likely: 0 };
    const count = extractLinks(entry.content_html ?? "", entry.url).length;
    state.links.push(count);
    if (count >= 5 || /digest|newsletter|roundup|brief|daily links|weekly links/i.test(entry.title)) state.likely++;
    grouped.set(key, state);
  }
  return [...grouped.entries()].map(([feedId, value]) => {
    const average = value.links.reduce((sum, count) => sum + count, 0) / Math.max(1, value.links.length);
    const reasons: string[] = [];
    if (average >= 5) reasons.push("high average outbound-link count");
    if (Math.max(...value.links, 0) >= 10) reasons.push("entry with 10+ outbound links");
    if (value.likely > 0) reasons.push("digest/newsletter language detected");
    return { feedId, feedTitle: value.title, entries: value.links.length, likelyEntries: value.likely, averageLinks: Math.round(average * 10) / 10, maxLinks: Math.max(...value.links, 0), reason: reasons };
  }).filter((candidate) => candidate.reason.length > 0).sort((a, b) => b.averageLinks - a.averageLinks);
}
