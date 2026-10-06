import type { StoryGroup } from "./curate.js";
import type { CuratableItem } from "./curate.js";
import { normalizeUrl } from "./links.js";

export interface RenderableStory extends StoryGroup { kind: "rss" | "fanout"; items: CuratableItem[]; }

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

function summaryParagraphs(value: string): string[] {
  const explicit = value.split(/\r?\n\s*\r?\n/).map((part) => part.trim()).filter(Boolean);
  const sentencesFor = (part: string) => part.match(/[^.!?]+(?:[.!?]+|$)/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [part.trim()];
  const chunks: string[] = [];
  for (const part of explicit.length > 1 ? explicit : [value.trim()]) {
    const sentences = sentencesFor(part);
    if (sentences.length <= 3 && part.length <= 700) {
      chunks.push(part);
      continue;
    }
    let current = "";
    let sentenceCount = 0;
    for (const sentence of sentences) {
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (current && (candidate.length > 700 || sentenceCount >= 3)) {
        chunks.push(current);
        current = sentence;
        sentenceCount = 1;
      } else {
        current = candidate;
        sentenceCount += 1;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks.filter(Boolean);
}

function renderStory(story: RenderableStory): string {
  const points = story.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  const titleUrl = story.items[0]?.url;
  const sourceItems = titleUrl
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
