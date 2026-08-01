import { describe, expect, it } from "vitest";
import { parseChatCompletionContent } from "./ai-response.js";

describe("parseChatCompletionContent", () => {
  it("assembles SSE delta content", () => {
    const sse = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: '{"summary":"' } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'ok"}' } }] })}`,
      "data: [DONE]",
    ].join("\n");
    expect(parseChatCompletionContent(sse)).toBe('{"summary":"ok"}');
  });
});
