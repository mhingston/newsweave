import { describe, expect, it } from "vitest";
import { selectStories } from "./selection.js";
import type { CuratableItem, StoryGroup } from "./curate.js";

const item = (id: string, feedId: string): CuratableItem => ({
  id, feedId, title: id, url: `https://example.com/${id}`, kind: "rss",
  summary: { summary: id, keyPoints: ["one", "two", "three"], relevance: 1, novelty: 1 },
});

const group = (id: string, score: number): StoryGroup => ({
  itemIds: [id], headline: id, summary: id, keyPoints: ["one", "two", "three"], score,
});

describe("selectStories", () => {
  it("caps the edition and limits stories per feed", () => {
    const items = [item("a1", "a"), item("a2", "a"), item("a3", "a"), item("b1", "b")];
    const groups = [group("a1", 1), group("a2", 0.9), group("a3", 0.8), group("b1", 0.7)];
    const selected = selectStories(groups, items, { maxStories: 3, maxStoriesPerFeed: 2 });
    expect(selected.map((story) => story.itemIds[0])).toEqual(["a1", "a2", "b1"]);
  });

  it("counts a multi-feed group once against each member feed", () => {
    const items = [item("a1", "a"), item("b1", "b"), item("a2", "a")];
    const groups = [{ ...group("joined", 1), itemIds: ["a1", "b1"] }, group("a2", 0.9)];
    const selected = selectStories(groups, items, { maxStories: 5, maxStoriesPerFeed: 1 });
    expect(selected).toHaveLength(1);
    expect(selected[0]?.itemIds).toEqual(["a1", "b1"]);
  });
});
