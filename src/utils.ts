/** Strip HTML tags and collapse whitespace for readable JSON output. */
export function htmlToText(html: string | undefined | null): string {
  if (!html) return "";
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function truncate(text: string, max = 2000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function parseArgs(argv: string[]): { limit?: number; sources?: string[] } {
  const out: { limit?: number; sources?: string[] } = {};
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      if (Number.isFinite(n) && n > 0) out.limit = Math.floor(n);
    }
    if (arg.startsWith("--sources=")) {
      out.sources = arg
        .slice("--sources=".length)
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    }
  }
  return out;
}

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "JobAggregatorMVP/0.1 (local-dev; contact: local)",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function makeId(source: string, externalId: string | number): string {
  return `${source}:${externalId}`;
}

export function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
