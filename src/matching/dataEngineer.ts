/**
 * Title matcher for Data Engineer–related roles.
 * Prefers phrase matches; excludes common false positives (data center, etc.).
 */

const NEGATIVE: RegExp[] = [
  /\bdata\s*center\b/i,
  /\bdata\s*entry\b/i,
  /\bdata\s*protection\b/i,
  /\bdata\s*privacy\b/i,
  /\bdata\s*governance\s*officer\b/i,
  /\bdata\s*annotat/i,
  /\bdata\s*label/i,
  /\bdata\s*scientist\b/i,
  /\bdata\s*science\b/i,
  /\bdata\s*analyst\b/i,
  /\bbusiness\s*analyst\b/i,
  /\bmachine\s*learning\s*engineer\b/i,
  /\bml\s*engineer\b/i,
  /\bresearch\s*scientist\b/i,
  /\bcomputer\s*scientist\b/i,
];

const POSITIVE: RegExp[] = [
  /\bdata\s*engineer(?:ing)?\b/i,
  /\banalytics\s*engineer(?:ing)?\b/i,
  /\betl\s*engineer\b/i,
  /\belt\s*engineer\b/i,
  /\bdata\s*platform\s*engineer\b/i,
  /\bdata\s*infrastructure\s*engineer\b/i,
  /\bbig\s*data\s*engineer\b/i,
  /\bdata\s*pipeline\s*engineer\b/i,
  /\bdata\s*warehouse\s*engineer\b/i,
  /\bsnowflake\s*engineer\b/i,
  /\bdatabricks\s*engineer\b/i,
  /\bdata\s*eng\b/i,
];

export function matchesDataEngineerRole(title: string): boolean {
  const t = title?.trim() ?? "";
  if (!t) return false;
  if (NEGATIVE.some((re) => re.test(t))) return false;
  return POSITIVE.some((re) => re.test(t));
}

/** Workday / API search phrases (server-side filter, still re-checked with matcher). */
export const DATA_ENGINEER_SEARCH_PHRASES = [
  "Data Engineer",
  "Analytics Engineer",
  "ETL Engineer",
  "Data Platform Engineer",
] as const;
