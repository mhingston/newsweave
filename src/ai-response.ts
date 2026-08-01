import { parseJsonObject } from "./json.js";

export function parseChatCompletionContent(responseText: string): string {
  const trimmed = responseText.trim();
  if (!trimmed) throw new Error("AI response body was empty");
  if (!trimmed.startsWith("data:")) {
    const payload = parseJsonObject(trimmed) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI response did not contain message content");
    return content;
  }
  let content = "";
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice("data:".length).trim();
    if (!data || data === "[DONE]") continue;
    const chunk = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
    content += chunk.choices?.[0]?.delta?.content ?? "";
  }
  if (!content.trim()) throw new Error("AI response did not contain message content");
  return content;
}
