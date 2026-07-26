import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface GreenhouseBoard {
  token: string;
  company: string;
}

export interface WorkdayBoard {
  company: string;
  host: string;
  tenant: string;
  site: string;
}

export interface LeverBoard {
  site: string;
  company: string;
}

export interface AshbyBoard {
  board: string;
  company: string;
}

export interface EightfoldBoard {
  domain: string;
  company: string;
}

export interface AtsConfig {
  greenhouse: GreenhouseBoard[];
  workday: WorkdayBoard[];
  lever: LeverBoard[];
  ashby: AshbyBoard[];
  eightfold: EightfoldBoard[];
  options: {
    maxJobsPerBoard: number;
    workdayPageSize: number;
    requestDelayMs: number;
  };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let cached: AtsConfig | null = null;

export async function loadAtsConfig(): Promise<AtsConfig> {
  if (cached) return cached;
  const raw = await readFile(path.join(ROOT, "config/ats-boards.json"), "utf8");
  const parsed = JSON.parse(raw) as Partial<AtsConfig>;
  cached = {
    greenhouse: parsed.greenhouse ?? [],
    workday: parsed.workday ?? [],
    lever: parsed.lever ?? [],
    ashby: parsed.ashby ?? [],
    eightfold: parsed.eightfold ?? [],
    options: {
      maxJobsPerBoard: parsed.options?.maxJobsPerBoard ?? 100,
      workdayPageSize: parsed.options?.workdayPageSize ?? 20,
      requestDelayMs: parsed.options?.requestDelayMs ?? 300,
    },
  };
  return cached;
}

/** Clear cache (tests / multi-run in same process). */
export function clearAtsConfigCache(): void {
  cached = null;
}
