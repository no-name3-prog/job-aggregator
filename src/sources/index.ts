import type { JobSource } from "../types.js";
import { arbeitnowSource } from "./arbeitnow.js";
import { ashbySource } from "./ashby.js";
import { eightfoldSource } from "./eightfold.js";
import { greenhouseSource } from "./greenhouse.js";
import { jobicySource } from "./jobicy.js";
import { leverSource } from "./lever.js";
import { remoteokSource } from "./remoteok.js";
import { remotiveSource } from "./remotive.js";
import { workdaySource } from "./workday.js";

export const allSources: JobSource[] = [
  remotiveSource,
  arbeitnowSource,
  jobicySource,
  remoteokSource,
  greenhouseSource,
  workdaySource,
  leverSource,
  ashbySource,
  eightfoldSource,
];

export function getSources(filter?: string[]): JobSource[] {
  if (!filter?.length) return allSources;
  const set = new Set(filter);
  const selected = allSources.filter((s) => set.has(s.name));
  if (!selected.length) {
    throw new Error(
      `No sources matched: ${filter.join(", ")}. Available: ${allSources
        .map((s) => s.name)
        .join(", ")}`,
    );
  }
  return selected;
}
