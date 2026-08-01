const TRACKING_PARAMS = new Set([
  "fbclid", "gclid", "mc_cid", "mc_eid", "ref", "ref_src", "utm_campaign",
  "utm_content", "utm_medium", "utm_source", "utm_term",
]);

const REJECTED_HOSTS = new Set([
  "facebook.com", "instagram.com", "linkedin.com", "pinterest.com", "t.co",
  "threads.net", "twitter.com", "x.com", "youtube.com",
]);

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function isCandidateArticleLink(value: string, parentUrl?: string): boolean {
  if (!isHttpUrl(value)) return false;
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (REJECTED_HOSTS.has(host) || host.endsWith(".facebook.com")) return false;
  if (/unsubscribe|preferences|privacy|terms|login|signin|signup|account/i.test(url.pathname)) return false;
  if (/\.(mp3|mp4|m4a|mov|avi|zip|pdf|png|jpg|jpeg|gif|webp)(?:$|\?)/i.test(url.pathname)) return false;
  if (parentUrl && normalizeUrl(value) === normalizeUrl(parentUrl)) return false;
  return true;
}

export function extractLinks(html: string, parentUrl?: string): string[] {
  const output = new Set<string>();
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(anchorPattern)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const absolute = new URL(raw, parentUrl).toString();
      if (isCandidateArticleLink(absolute, parentUrl)) output.add(normalizeUrl(absolute));
    } catch {
      // Ignore malformed links; the parent entry remains processable.
    }
  }
  return [...output];
}
