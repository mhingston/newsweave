export function parseJsonObject(value: string): Record<string, unknown> {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("AI response contained no JSON object");
  const parsed: unknown = JSON.parse(value.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("AI response JSON was not an object");
  return parsed as Record<string, unknown>;
}
