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
    if (parsed.text.trim()) return parsed;
  } catch (error) {
    if (!isYouTube(input.url)) throw error;
  }

  if (isYouTube(input.url)) {
    const result = await runFile(config.YTDLP_BIN, ["--dump-single-json", "--skip-download", input.url], {
      timeout: 120_000,
      maxBuffer: 5 * 1024 * 1024,
    });
    const metadata = JSON.parse(result.stdout) as { title?: string; description?: string };
    return {
      title: metadata.title?.trim() || input.title,
      text: [metadata.title, metadata.description].filter((value): value is string => Boolean(value?.trim())).join("\n\n"),
      source: "youtube-metadata",
    };
  }

  throw new Error(`Fabric returned no usable content for ${input.url}`);
}
