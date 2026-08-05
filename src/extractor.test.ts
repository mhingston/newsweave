import { describe, expect, it } from "vitest";
import { isExtractorError, isUnusableYouTubeContent, parseFabric } from "./extractor.js";

describe("Fabric extraction error handling", () => {
  it("recognises Hugging Face anti-abuse responses", () => {
    const body = JSON.stringify({ data: null, code: 403, name: "AbuseAlleviationError", message: "Anonymous access to huggingface.co blocked due to SSRF security violation" });
    expect(isExtractorError(body)).toBe(true);
    expect(() => parseFabric(body, "Fallback")).toThrow(/extraction error/);
  });

  it("keeps ordinary Fabric content", () => {
    expect(parseFabric("Title: Example\n\nMarkdown Content:\n\nArticle text", "Fallback")).toEqual({ title: "Example", text: "Article text", source: "fabric" });
  });

  it("rejects placeholder and bot-check YouTube content", () => {
    expect(isUnusableYouTubeContent("https://www.youtube.com/watch?v=abc", "- YouTube", "player UI only")).toBe(true);
    expect(isUnusableYouTubeContent("https://www.youtube.com/watch?v=abc", "A real video", "Sign in to confirm you're not a bot")).toBe(true);
    expect(isUnusableYouTubeContent("https://www.youtube.com/watch?v=abc", "A real video", "A substantive description with useful context.")).toBe(false);
  });
});
