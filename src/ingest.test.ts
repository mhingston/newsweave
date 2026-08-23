import { describe, expect, it } from "vitest";
import type { Config } from "./config.js";
import { qualifiesAsDigest, resolveFanout } from "./ingest.js";

const config = {
  FANOUT_FEED_IDS: "1,230",
  FANOUT_FEED_TITLES: "ben's bites",
  FANOUT_CANDIDATE_FEED_IDS: "165,167",
  FANOUT_CANDIDATE_FEED_TITLES: "Cloud Blog",
  FANOUT_MIN_LINKS: 5,
  FANOUT_MIN_DOMAINS: 3,
} as unknown as Config;

const digestLinks = [
  "https://arxiv.org/abs/1",
  "https://openai.com/blog/x",
  "https://github.com/y/z",
  "https://example.com/a",
  "https://news.ycombinator.com/item",
];

describe("qualifiesAsDigest", () => {
  it("passes when link and domain thresholds are met", () => {
    expect(qualifiesAsDigest(digestLinks, config)).toBe(true);
  });

  it("fails below the link threshold", () => {
    expect(qualifiesAsDigest(digestLinks.slice(0, 4), config)).toBe(false);
  });

  it("fails when links span too few domains", () => {
    const sameDomain = [
      "https://a.example/1", "https://a.example/2", "https://a.example/3",
      "https://b.example/1", "https://b.example/2",
    ];
    expect(qualifiesAsDigest(sameDomain, config)).toBe(false);
  });
});

describe("resolveFanout", () => {
  it("always fans out configured feed ids regardless of content", () => {
    expect(resolveFanout({ feedId: 1, feedTitle: "anything" }, [], config)).toBe(true);
  });

  it("matches configured titles case-insensitively", () => {
    expect(resolveFanout({ feedId: 999, feedTitle: "Ben's Bites" }, [], config)).toBe(true);
  });

  it("fans out candidate entries that look like digests", () => {
    expect(resolveFanout({ feedId: 165, feedTitle: "Simon Willison's Weblog" }, digestLinks, config)).toBe(true);
  });

  it("matches candidate titles case-insensitively", () => {
    expect(resolveFanout({ feedId: 999, feedTitle: "cloud blog" }, digestLinks, config)).toBe(true);
  });

  it("keeps candidate entries that do not look like digests as rss", () => {
    expect(resolveFanout({ feedId: 167, feedTitle: "Martin Fowler" }, digestLinks.slice(0, 3), config)).toBe(false);
  });

  it("never applies the heuristic to unlisted feeds", () => {
    expect(resolveFanout({ feedId: 168, feedTitle: "Ed Zitron's Where's Your Ed At" }, digestLinks, config)).toBe(false);
  });
});
