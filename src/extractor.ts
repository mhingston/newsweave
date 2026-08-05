import { execFile } from "node:child_process";
import type { Config } from "./config.js";

export interface ExtractedContent {
  title: string;
  text: string;
  source: "fabric" | "youtube-metadata";
}

function runFile(file: string, args: string[], options: { timeout: number; maxBuffer: number }): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { ...options, env: { ...process.env } }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
    child.stdin?.end();
  });
}

export function isExtractorError(raw: string): boolean {
  const trimmed = raw.trim();
  if (/AbuseAlleviationError|Anonymous access to .* blocked|SSRF security violation/i.test(trimmed)) return true;
  try {
    const parsed = JSON.parse(trimmed) as { code?: unknown; status?: unknown; name?: unknown; data?: unknown };
    return parsed.data === null && (parsed.code === 403 || parsed.status === 403 || parsed.name === "AbuseAlleviationError");
  } catch {
    return false;
  }
}

function isPlaceholderVideoTitle(title: string): boolean {
  return /^(?:[-–—]\s*)?youtube(?:\s+video)?$/i.test(title.trim());
}

export function isUnusableYouTubeContent(url: string, title: string, text: string): boolean {
  if (!isYouTube(url)) return false;
  if (isYouTubeShortUrl(url) || isPlaceholderVideoTitle(title)) return true;
  return /AbuseAlleviationError|Anonymous access to .* blocked|SSRF security violation|bot check|confirm (?:you['’]re|you are) not a bot|verify (?:you['’]re|you are) not a bot|captcha|only metadata|metadata only|no video title|no transcript.*available|no article content/i.test(`${title}\n${text}`);
}

function isYouTubeShortUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") && /^\/shorts(?:\/|$)/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function parseFabric(raw: string, fallbackTitle: string): ExtractedContent {
  if (isExtractorError(raw)) throw new Error(`Fabric returned an extraction error: ${raw.trim().slice(0, 1000)}`);
  const marker = raw.indexOf("Markdown Content:");
  if (marker < 0) return { title: fallbackTitle, text: raw.trim(), source: "fabric" };
  const header = raw.slice(0, marker);
  const body = raw.slice(marker + "Markdown Content:".length).trim();
  const titleLine = header.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
  return { title: titleLine || fallbackTitle, text: body, source: "fabric" };
}

function isYouTube(url: string): boolean {
  try { return /(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(new URL(url).hostname); } catch { return false; }
}

export async function extractContent(config: Config, input: { url: string; title: string }): Promise<ExtractedContent> {
  try {
    const result = await runFile(config.FABRIC_BIN, ["-u", input.url], {
      timeout: 120_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const parsed = parseFabric(result.stdout, input.title);
    if (parsed.text.trim() && !isUnusableYouTubeContent(input.url, parsed.title, parsed.text)) return parsed;
  } catch (error) {
    if (!isYouTube(input.url)) throw error;
  }

  if (isYouTube(input.url)) {
    const result = await runFile(config.YTDLP_BIN, ["--dump-single-json", "--skip-download", input.url], {
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const metadata = JSON.parse(result.stdout) as { title?: string; description?: string };
    const title = metadata.title?.trim() || "";
    const description = metadata.description?.trim() || "";
    if (!title || isPlaceholderVideoTitle(title) || !description || isUnusableYouTubeContent(input.url, title, description) || description.length < 120) {
      throw new Error("YouTube returned no usable title and substantive description");
    }
    return {
      title,
      text: [title, description].join("\n\n"),
      source: "youtube-metadata",
    };
  }

  throw new Error(`Fabric returned no usable content for ${input.url}`);
}
