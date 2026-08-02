import { describe, expect, it } from "vitest";
import { renderDigest, type RenderableStory } from "./email.js";

const story = (kind: "rss" | "fanout"): RenderableStory => ({
  itemIds: ["1"],
  headline: "A story",
  summary: "A summary",
  keyPoints: ["One", "Two", "Three"],
  score: 1,
  kind,
  items: [{ id: "1", feedId: "feed-1", title: "Source title", url: "https://example.com/story", kind, summary: { summary: "A summary", keyPoints: ["One", "Two", "Three"], relevance: 1, novelty: 1 } }],
});

describe("renderDigest", () => {
  it("omits appended sources for ordinary RSS stories", () => {
    const html = renderDigest("2026-08-02", [story("rss")]);
    expect(html).not.toContain("<strong>Sources</strong>");
  });

  it("keeps appended sources for fan-out stories", () => {
    const html = renderDigest("2026-08-02", [story("fanout")]);
    expect(html).toContain("<strong>Sources</strong>");
  });
});
