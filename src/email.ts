import type { StoryGroup } from "./curate.js";
import type { CuratableItem } from "./curate.js";

export interface RenderableStory extends StoryGroup { kind: "rss" | "fanout"; items: CuratableItem[]; }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function renderStory(story: RenderableStory): string {
  const points = story.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  const links = story.items.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></li>`).join("");
  return `<article><h3><a href="${escapeHtml(story.items[0]?.url ?? "#")}">${escapeHtml(story.headline)}</a></h3><p>${escapeHtml(story.summary)}</p><ul>${points}</ul><p><strong>Sources</strong></p><ul>${links}</ul></article>`;
}

export function renderDigest(date: string, stories: RenderableStory[]): string {
  const top = stories.slice(0, Math.min(10, stories.length));
  const remaining = stories.slice(top.length).filter((story) => story.kind === "rss");
  const fanout = stories.filter((story) => story.kind === "fanout");
  const section = (title: string, values: RenderableStory[]) => values.length ? `<h2>${title}</h2>${values.map(renderStory).join("\n")}` : "";
  return `<!doctype html><html><body><h1>Newsweave Daily — ${escapeHtml(date)}</h1>${section("Top Stories", top)}${section("More Coverage", remaining)}${section("Fan-out Discoveries", fanout)}</body></html>`;
}
