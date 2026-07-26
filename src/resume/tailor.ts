/**
 * Free, offline resume tailor — no paid LLM.
 * Extracts keywords from the JD and rewrites emphasis in the base resume.
 * User must review for truthfulness before applying.
 */

const STOP = new Set(
  `a an the and or of to for in on with by from as at is are was were be been being
   this that these those it its we our you your they their will can may must should
   job role team work working experience years year about us our company who what
   how into over under than then also such other more most new using use used
   ability able strong preferred required requirements responsibilities including
   equal opportunity employer status gender race`.split(/\s+/),
);

const TECH_HINTS = [
  "python",
  "sql",
  "spark",
  "airflow",
  "dbt",
  "kafka",
  "flink",
  "snowflake",
  "bigquery",
  "redshift",
  "databricks",
  "aws",
  "gcp",
  "azure",
  "s3",
  "etl",
  "elt",
  "pipeline",
  "warehouse",
  "lakehouse",
  "parquet",
  "delta",
  "iceberg",
  "docker",
  "kubernetes",
  "terraform",
  "ci/cd",
  "scala",
  "java",
  "looker",
  "tableau",
  "power bi",
  "hadoop",
  "hive",
  "presto",
  "trino",
  "postgres",
  "mysql",
  "mongodb",
  "redis",
  "beam",
  "dagster",
  "prefect",
  "great expectations",
  "mlops",
  "streaming",
  "batch",
];

export interface TailorResult {
  tailoredText: string;
  matchedKeywords: string[];
  suggestedBullets: string[];
  note: string;
}

export function extractKeywords(jd: string, limit = 24): string[] {
  const lower = jd.toLowerCase();
  const found = new Set<string>();

  for (const hint of TECH_HINTS) {
    if (lower.includes(hint)) found.add(hint);
  }

  const words = lower
    .replace(/[^a-z0-9+.#/\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

  const ranked = [...freq.entries()]
    .filter(([w, n]) => n >= 2 || TECH_HINTS.includes(w))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

  for (const w of ranked) {
    if (found.size >= limit) break;
    found.add(w);
  }

  return [...found].slice(0, limit);
}

function buildSuggestedBullets(keywords: string[], title: string, company: string): string[] {
  const k = keywords.slice(0, 8);
  const tech = k.filter((x) => TECH_HINTS.includes(x)).slice(0, 5);
  const techStr = tech.length ? tech.join(", ") : "Python, SQL, modern data stack";

  return [
    `Built and operated reliable data pipelines relevant to ${title} needs (${techStr}).`,
    `Modeled analytics-ready datasets and enforced data quality checks for stakeholders.`,
    `Collaborated cross-functionally to deliver trusted data products${company ? ` in environments similar to ${company}` : ""}.`,
    keywords.includes("streaming") || keywords.includes("kafka")
      ? "Designed streaming and batch ingestion patterns for near-real-time and warehouse workloads."
      : "Optimized batch ETL/ELT for cost, latency, and maintainability.",
    keywords.includes("dbt") || keywords.includes("warehouse") || keywords.includes("snowflake") || keywords.includes("bigquery")
      ? "Implemented warehouse transformations (dbt/SQL) with testing and documentation."
      : "Documented data contracts and lineage for critical business metrics.",
  ];
}

export function tailorResume(input: {
  baseResumeText: string;
  jobTitle: string;
  company: string;
  jobDescription: string;
}): TailorResult {
  const keywords = extractKeywords(
    `${input.jobTitle}\n${input.company}\n${input.jobDescription}`,
  );
  const suggestedBullets = buildSuggestedBullets(
    keywords,
    input.jobTitle,
    input.company,
  );

  const base = input.baseResumeText.trim() || "No base resume set. Add one under Resume.";
  const keywordLine = keywords.length
    ? keywords.map((k) => k.toUpperCase()).join(" · ")
    : "DATA ENGINEERING · SQL · PYTHON · PIPELINES";

  const tailoredText = `${base}

--------------------------------------------------------------------------------
TARGET ROLE (review & edit — do not invent experience)
${input.jobTitle} @ ${input.company}

JD ALIGNMENT KEYWORDS TO EMPHASIZE
${keywordLine}

SUGGESTED BULLETS TAILORED TO THIS JD
(Only keep bullets that are true for you.)
${suggestedBullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}
--------------------------------------------------------------------------------
`.trim();

  return {
    tailoredText,
    matchedKeywords: keywords,
    suggestedBullets,
    note: "Draft only. Edit for accuracy before you apply on the official career site. Auto-apply is not enabled.",
  };
}
