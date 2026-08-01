import { describe, expect, it } from "vitest";
import { parseJsonObject } from "./json.js";

describe("AI JSON parsing", () => {
  it("accepts whitespace and an SSE trailer around a JSON object", () => {
    expect(parseJsonObject("\n {\"ok\":true}\ndata: [DONE]\n")).toEqual({ ok: true });
  });
});
