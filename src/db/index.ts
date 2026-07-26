import "dotenv/config";
import { FileStore } from "./fileStore.js";
import { MongoStore } from "./mongoStore.js";
import type { DataStore } from "./types.js";

let store: DataStore | null = null;

export async function getStore(): Promise<DataStore> {
  if (store) return store;

  const uri = process.env.MONGODB_URI?.trim();
  if (uri) {
    const dbName = process.env.MONGODB_DB?.trim() || "job_aggregator";
    console.log(`[db] Using MongoDB (${dbName})`);
    store = new MongoStore(uri, dbName);
  } else {
    console.log("[db] MONGODB_URI not set — using local JSON store (data/store/)");
    store = new FileStore();
  }
  await store.ensureReady();
  return store;
}

export type { DataStore, Application, StoredJob, Metrics, UserProfile, ApplicationStatus } from "./types.js";
