import { describe, expect, it } from "vitest";
import { extractLinks, normalizeUrl } from "./links.js";

describe("link extraction", () => {
  it("extracts, absolutizes, normalizes, and deduplicates article links", () => {
    const html = `
      <a href="https://Example.com/story/?utm_source=newsletter#top">Story</a>
      <a href="https://example.com/story/">Duplicate</a>
      <a href="/local">Local</a>
      <a href="https://example.com/file.pdf">PDF</a>
      <a href="https://x.com/user/status/1">Social</a>
    `;
    expect(extractLinks(html, "https://digest.example/news")).toEqual([
      "https://example.com/story",
      "https://digest.example/local",
    ]);
  });

  it("removes tracking parameters but preserves ordinary query parameters", () => {
    expect(normalizeUrl("https://example.com/story?a=1&utm_medium=email#x")).toBe(
      "https://example.com/story?a=1",
    );
  });
});
