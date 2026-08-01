import type { Config } from "./config.js";
import { parseJsonObject } from "./json.js";
import { parseChatCompletionContent } from "./ai-response.js";

export interface ItemSummary {
  summary: string;
  keyPoints: string[];
  relevance: number;
  novelty: number;
}

function parseNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

export async function summarize(config: Config, input: { title: string; url: string; text: string }): Promise<ItemSummary> {
  const response = await fetch(`${config.AI_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(120_000),
    headers: { Authorization: `Bearer ${config.AI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.AI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You curate a personal daily news digest. Return only valid JSON with summary (string), keyPoints (array of 3 to 5 concise strings), relevance (number 0 to 1), and novelty (number 0 to 1). Be factual and use only the supplied text." },
        { role: "user", content: JSON.stringify({ title: input.title, url: input.url, content: input.text }) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI ${response.status} ${response.statusText}: ${await response.text()}`);
  const raw = parseJsonObject(parseChatCompletionContent(await response.text()));
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  const keyPoints = Array.isArray(raw.keyPoints) ? raw.keyPoints.filter((value): value is string => typeof value === "string" && value.trim() !== "").map((value) => value.trim()).slice(0, 5) : [];
  if (!summary || keyPoints.length < 3) throw new Error("AI response did not meet the summary contract");
  return { summary, keyPoints, relevance: parseNumber(raw.relevance), novelty: parseNumber(raw.novelty) };
}
