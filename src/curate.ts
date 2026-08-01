import type { Config } from "./config.js";
import { parseJsonObject } from "./json.js";
import { parseChatCompletionContent } from "./ai-response.js";

export interface CuratableItem {
  id: string;
  title: string;
  url: string;
  kind: "rss" | "fanout";
  summary: { summary: string; keyPoints: string[]; relevance: number; novelty: number };
}

export interface StoryGroup {
  itemIds: string[];
  headline: string;
  summary: string;
  keyPoints: string[];
  score: number;
}

function singleton(item: CuratableItem): StoryGroup {
  return { itemIds: [item.id], headline: item.title, summary: item.summary.summary, keyPoints: item.summary.keyPoints, score: item.summary.relevance * 0.7 + item.summary.novelty * 0.3 };
}

export async function curate(config: Config, items: CuratableItem[]): Promise<StoryGroup[]> {
  if (items.length === 0) return [];
  try {
    const response = await fetch(`${config.AI_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(120_000),
      headers: { Authorization: `Bearer ${config.AI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.AI_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a careful news editor. Group only items covering the same specific underlying event. Keep unrelated items separate. Return JSON {groups:[{itemIds:string[],headline:string,summary:string,keyPoints:string[],score:number}]}. Every input ID must appear exactly once. Use only supplied facts." },
          { role: "user", content: JSON.stringify(items.map((item) => ({ id: item.id, title: item.title, url: item.url, summary: item.summary }))) },
        ],
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    const parsed = parseJsonObject(parseChatCompletionContent(await response.text())).groups;
    if (!Array.isArray(parsed)) throw new Error("invalid grouping response");
    const known = new Map(items.map((item) => [item.id, item]));
    const seen = new Set<string>();
    const groups: StoryGroup[] = [];
    for (const raw of parsed) {
      if (!raw || typeof raw !== "object") throw new Error("invalid grouping item");
      const rawObject = raw as Record<string, unknown>;
      if (!Array.isArray(rawObject.itemIds)) throw new Error("invalid grouping item");
      const ids = rawObject.itemIds.filter((id: unknown): id is string => typeof id === "string" && known.has(id) && !seen.has(id));
      if (ids.length === 0) continue;
      ids.forEach((id) => seen.add(id));
      const members = ids.map((id) => known.get(id)!);
      const fallback = singleton(members[0]!);
      groups.push({
        itemIds: ids,
        headline: typeof rawObject.headline === "string" && rawObject.headline.trim() ? rawObject.headline.trim() : fallback.headline,
        summary: typeof rawObject.summary === "string" && rawObject.summary.trim() ? rawObject.summary.trim() : fallback.summary,
        keyPoints: Array.isArray(rawObject.keyPoints) ? rawObject.keyPoints.filter((point: unknown): point is string => typeof point === "string").slice(0, 5) : fallback.keyPoints,
        score: typeof rawObject.score === "number" ? Math.max(0, Math.min(1, rawObject.score)) : Math.max(...members.map(() => fallback.score)),
      });
    }
    for (const item of items) if (!seen.has(item.id)) groups.push(singleton(item));
    return groups.sort((a, b) => b.score - a.score);
  } catch {
    return items.map(singleton).sort((a, b) => b.score - a.score);
  }
}
