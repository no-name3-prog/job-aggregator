/**
 * Job retention policy
 * --------------------
 * Jobs older than JOB_RETENTION_DAYS (default 15) are removed from the DB/store
 * and from committed JSON dumps.
 *
 * Age is based on (first available):
 *   postedAt → lastSeenAt → scrapedAt → firstSeenAt
 */

export const DEFAULT_RETENTION_DAYS = 15;

export function getRetentionDays(): number {
  const raw = process.env.JOB_RETENTION_DAYS;
  if (raw == null || raw === "") return DEFAULT_RETENTION_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_RETENTION_DAYS;
  return Math.floor(n);
}

export function retentionCutoffIso(days = getRetentionDays()): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export function jobAgeReferenceIso(job: {
  postedAt?: string | null;
  lastSeenAt?: string;
  scrapedAt?: string;
  firstSeenAt?: string;
}): string | null {
  const candidates = [
    job.postedAt,
    job.lastSeenAt,
    job.scrapedAt,
    job.firstSeenAt,
  ].filter((v): v is string => Boolean(v && String(v).trim()));

  if (!candidates.length) return null;

  // Use the *newest* known timestamp so a recently re-scraped old post can survive
  // until it falls off the board; still drop if even the newest signal is old.
  let newest = candidates[0]!;
  for (const c of candidates) {
    if (Date.parse(c) > Date.parse(newest)) newest = c;
  }
  return newest;
}

export function isJobStale(
  job: {
    postedAt?: string | null;
    lastSeenAt?: string;
    scrapedAt?: string;
    firstSeenAt?: string;
  },
  cutoffIso = retentionCutoffIso(),
): boolean {
  const ref = jobAgeReferenceIso(job);
  // No dates at all → treat as stale (cannot prove freshness)
  if (!ref) return true;
  return Date.parse(ref) < Date.parse(cutoffIso);
}

export function filterFreshJobs<T extends {
  postedAt?: string | null;
  lastSeenAt?: string;
  scrapedAt?: string;
  firstSeenAt?: string;
}>(jobs: T[], days = getRetentionDays()): { kept: T[]; removed: number; cutoffIso: string } {
  const cutoffIso = retentionCutoffIso(days);
  const kept = jobs.filter((j) => !isJobStale(j, cutoffIso));
  return { kept, removed: jobs.length - kept.length, cutoffIso };
}
