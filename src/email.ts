import type { StoryGroup } from "./curate.js";
import type { CuratableItem } from "./curate.js";
import { normalizeUrl } from "./links.js";

export interface RenderableStory extends StoryGroup { kind: "rss" | "fanout"; items: CuratableItem[]; }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function summaryParagraphs(value: string): string[] {
  const explicit = value.split(/\r?\n\s*\r?\n/).map((part) => part.trim()).filter(Boolean);
  if (explicit.length > 1) return explicit;
  const sentences = value.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [value.trim()];
  if (sentences.length < 4) return [value.trim()];
  const midpoint = Math.ceil(sentences.length / 2);
  return [sentences.slice(0, midpoint).join(" "), sentences.slice(midpoint).join(" ")];
}

function renderStory(story: RenderableStory): string {
  const points = story.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  const titleUrl = story.items[0]?.url;
  const sourceItems = story.kind === "fanout" && titleUrl
    ? story.items.filter((item) => {
      try { return normalizeUrl(item.url) !== normalizeUrl(titleUrl); } catch { return item.url !== titleUrl; }
    })
    : [];
  const sources = sourceItems.length > 0
    ? `<p><strong>Sources</strong></p><ul>${sourceItems.map((item) => `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></li>`).join("")}</ul>`
    : "";
  const summary = summaryParagraphs(story.summary).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  return `<article><h3><a href="${escapeHtml(story.items[0]?.url ?? "#")}">${escapeHtml(story.headline)}</a></h3>${summary}<ul>${points}</ul>${sources}</article>`;
}

export function renderDigest(date: string, stories: RenderableStory[]): string {
  const rss = stories.filter((story) => story.kind === "rss");
  const top = rss.slice(0, 10);
  const remaining = rss.slice(top.length);
  const fanout = stories.filter((story) => story.kind === "fanout");
  const section = (title: string, values: RenderableStory[]) => values.length ? `<h2>${title}</h2>${values.map(renderStory).join("\n")}` : "";
  return `<!doctype html><html><body><h1>Newsweave Daily — ${escapeHtml(date)}</h1>${section("Top Stories", top)}${section("More Coverage", remaining)}${section("Fan-out Discoveries", fanout)}</body></html>`;
}
