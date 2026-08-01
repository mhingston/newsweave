export interface MinifluxEntry {
  id: number;
  feedId: number;
  feedTitle: string;
  title: string;
  url: string;
  contentHtml: string;
  categoryTitle?: string;
  publishedAt?: string;
}

interface RawEntry {
  id: number;
  feed_id: number;
  feed_title?: string;
  feed?: { title?: string };
  title: string;
  url: string;
  content?: string;
  published_at?: string;
  category?: { title?: string } | null;
}

export function createMinifluxClient(opts: { baseUrl: string; token: string; fetchImpl?: typeof fetch }) {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  return {
    async listEntries(afterEntryId: number, limit = 1000): Promise<MinifluxEntry[]> {
      const params = new URLSearchParams([
        ["status", "read"], ["status", "unread"], ["order", "id"], ["direction", "asc"],
        ["limit", String(limit)], ["after_entry_id", String(afterEntryId)],
      ]);
      const url = `${base}/v1/entries?${params}`;
      const response = await fetchImpl(url, { headers: { "X-Auth-Token": opts.token, Accept: "application/json" } });
      if (!response.ok) throw new Error(`Miniflux ${response.status} ${response.statusText}: ${await response.text()}`);
      const payload = await response.json() as { entries?: RawEntry[] };
      return (payload.entries ?? []).map((entry) => {
        const mapped: MinifluxEntry = {
          id: entry.id,
          feedId: entry.feed_id,
          feedTitle: entry.feed_title ?? entry.feed?.title ?? `Feed ${entry.feed_id}`,
          title: entry.title,
          url: entry.url,
          contentHtml: entry.content ?? "",
        };
        if (entry.category?.title) mapped.categoryTitle = entry.category.title;
        if (entry.published_at) mapped.publishedAt = entry.published_at;
        return mapped;
      });
    },
    async markEntriesRead(entryIds: number[]): Promise<void> {
      if (entryIds.length === 0) return;
      const url = `${base}/v1/entries`;
      const response = await fetchImpl(url, {
        method: "PUT",
        headers: { "X-Auth-Token": opts.token, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ entry_ids: entryIds, status: "read" }),
      });
      if (!response.ok) throw new Error(`Miniflux ${response.status} ${response.statusText}: ${await response.text()}`);
    },
  };
}
