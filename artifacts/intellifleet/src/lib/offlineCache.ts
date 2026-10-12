// Cache of the last good server responses so screens still render offline.
import { classifyFailure } from "./tripErrors.ts";
import type { QueueStorage } from "./offlineQueue.ts";

export interface Cached<T> {
  data: T;
  // true when the network failed and `data` is the saved copy.
  offline: boolean;
  saved_at: number | null;
}

export async function cachedFetch<T>(
  storage: QueueStorage | null,
  key: string,
  fetcher: () => Promise<T>,
  now: () => number = () => Date.now(),
): Promise<Cached<T>> {
  try {
    const data = await fetcher();
    const saved_at = now();
    if (storage) {
      try {
        await storage.setCache(key, { saved_at, data });
      } catch {
        // cache is best effort
      }
    }
    return { data, offline: false, saved_at };
  } catch (err) {
    const { kind } = classifyFailure(err);
    if ((kind === "network" || kind === "retry") && storage) {
      let rec;
      try {
        rec = await storage.getCache(key);
      } catch {
        rec = undefined;
      }
      if (rec) return { data: rec.data as T, offline: true, saved_at: rec.saved_at };
    }
    throw err;
  }
}

export function cacheKey(scope: string | null | undefined, name: string, id?: string): string {
  return [scope || "self", name, id].filter(Boolean).join(":");
}
