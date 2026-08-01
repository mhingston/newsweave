import { describe, expect, it, vi } from "vitest";
import { createMinifluxClient } from "./miniflux.js";

describe("Miniflux client", () => {
  it("requests both read and unread entries after the cursor", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      entries: [{ id: 7, feed_id: 3, feed_title: "Digest", title: "Issue", url: "https://example.com", content: "<p>x</p>", category: { title: "Blogs" } }],
    }), { status: 200 }));
    const client = createMinifluxClient({ baseUrl: "http://rss.test", token: "token", fetchImpl });
    await expect(client.listEntries(6)).resolves.toEqual([{
      id: 7,
      feedId: 3,
      feedTitle: "Digest",
      title: "Issue",
      url: "https://example.com",
      contentHtml: "<p>x</p>",
      categoryTitle: "Blogs",
    }]);
    const requestUrl = String(fetchImpl.mock.calls[0]?.[0]);
    expect(requestUrl).toContain("status=read");
    expect(requestUrl).toContain("status=unread");
    expect(requestUrl).toContain("after_entry_id=6");
  });

  it("marks only the ingested entry IDs as read", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 200 }));
    const client = createMinifluxClient({ baseUrl: "http://rss.test", token: "token", fetchImpl });
    await client.markEntriesRead([7, 8]);
    expect(fetchImpl).toHaveBeenCalledWith("http://rss.test/v1/entries", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ entry_ids: [7, 8], status: "read" }),
    }));
  });
});
