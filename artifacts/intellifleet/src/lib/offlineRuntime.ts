// Browser wiring for the offline queue: one engine per page lifetime, sync triggers, React hooks.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import * as driverApi from "../services/api/driver.ts";
import { clearStoredSessionId, getStoredSessionId } from "../services/api/client.ts";
import { browserPollDeps, startVisibilityPolling } from "./driver.ts";
import { cacheKey, cachedFetch } from "./offlineCache.ts";
import type { Cached } from "./offlineCache.ts";
import { createQueueEngine } from "./offlineQueue.ts";
import type { QueueEngine, QueueEntry, QueueStorage } from "./offlineQueue.ts";
import { openBestStorage } from "./offlineStorage.ts";
import type { StorageKind } from "./offlineStorage.ts";
import { createSubmitter } from "./tripActions.ts";
import type { Submitter } from "./tripActions.ts";
import { queueCounts } from "./tripState.ts";
import type { ActionResponse } from "./tripTypes.ts";

export interface Runtime {
  engine: QueueEngine;
  submitter: Submitter;
  storage: QueueStorage;
  storageKind: StorageKind;
}

const SYNC_INTERVAL_MS = 30_000;
const EMPTY: QueueEntry[] = [];

let runtime: Runtime | null = null;
let initPromise: Promise<Runtime> | null = null;
const storeListeners = new Set<() => void>();
const resultListeners = new Set<(entry: QueueEntry, response: ActionResponse) => void>();
const notify = () => storeListeners.forEach((l) => l());

export function subscribeResults(fn: (entry: QueueEntry, response: ActionResponse) => void): () => void {
  resultListeners.add(fn);
  return () => resultListeners.delete(fn);
}

function goToLogin() {
  clearStoredSessionId();
  const signInPath = window.location.pathname.startsWith("/driver") ? "/driver/login" : "/login";
  if (window.location.pathname !== signInPath) window.location.assign(signInPath);
}

export function ensureRuntime(): Promise<Runtime> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const { storage, kind } = await openBestStorage();
    const api = {
      post: (path: string, body: Record<string, unknown>) => driverApi.postAction(path, body),
      upload: (req: Parameters<typeof driverApi.uploadPhoto>[0]) => driverApi.uploadPhoto(req),
    };
    const engine = createQueueEngine({
      storage,
      api,
      onUnauthorized: goToLogin,
      onResult: (entry, response) => resultListeners.forEach((l) => l(entry, response)),
    });
    await engine.load();
    const rt: Runtime = { engine, submitter: createSubmitter({ engine, api }), storage, storageKind: kind };
    runtime = rt;

    // Sync triggers: after each enqueue, on `online`, when the tab becomes visible, and every 30 s
    // only while visible AND the queue is non-empty.
    let lastSeq = engine.getSnapshot().reduce((m, e) => Math.max(m, e.seq), 0);
    engine.subscribe(() => {
      notify();
      const maxSeq = engine.getSnapshot().reduce((m, e) => Math.max(m, e.seq), 0);
      if (maxSeq > lastSeq) {
        lastSeq = maxSeq;
        void engine.sync();
      }
    });
    window.addEventListener("online", () => void engine.sync({ force: true }));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && engine.hasWork()) void engine.sync();
    });
    startVisibilityPolling(
      () => {
        if (engine.hasWork()) void engine.sync();
      },
      SYNC_INTERVAL_MS,
      browserPollDeps(),
    );
    notify();
    if (engine.hasWork()) void engine.sync();
    return rt;
  })();
  return initPromise;
}

function subscribe(listener: () => void): () => void {
  storeListeners.add(listener);
  void ensureRuntime();
  return () => storeListeners.delete(listener);
}

const getSnapshot = (): QueueEntry[] => (runtime ? runtime.engine.getSnapshot() : EMPTY);

export function useRuntime(): Runtime | null {
  const [rt, setRt] = useState<Runtime | null>(runtime);
  useEffect(() => {
    let live = true;
    void ensureRuntime().then((r) => {
      if (live) setRt(r);
    });
    return () => {
      live = false;
    };
  }, []);
  return rt;
}

export function useOfflineQueue() {
  const entries = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  const { pending, needsAttention } = queueCounts(entries);
  const retry = useCallback(async (id: string) => {
    const rt = await ensureRuntime();
    await rt.engine.retry(id);
    void rt.engine.sync({ force: true });
  }, []);
  const dismiss = useCallback(async (id: string) => {
    const rt = await ensureRuntime();
    await rt.engine.dismiss(id);
  }, []);
  const syncNow = useCallback(async () => {
    const rt = await ensureRuntime();
    return rt.engine.sync({ force: true });
  }, []);
  return { entries, pending, needsAttention, retry, dismiss, syncNow };
}

// Cache keys are tied to the login token so another user on the same phone never sees saved data.
function sessionScope(): string {
  const t = getStoredSessionId() ?? "";
  return t.slice(-10) || "anon";
}

export async function fetchWithCache<T>(name: string, id: string | undefined, adminDriverId: string | null, fetcher: () => Promise<T>): Promise<Cached<T>> {
  let storage: QueueStorage | null = null;
  try {
    storage = (await ensureRuntime()).storage;
  } catch {
    storage = null;
  }
  return cachedFetch(storage, cacheKey(`${sessionScope()}:${adminDriverId ?? "self"}`, name, id), fetcher);
}

export async function saveToCache(name: string, id: string | undefined, adminDriverId: string | null, data: unknown): Promise<void> {
  try {
    const rt = await ensureRuntime();
    await rt.storage.setCache(cacheKey(`${sessionScope()}:${adminDriverId ?? "self"}`, name, id), { saved_at: Date.now(), data });
  } catch {
    // best effort
  }
}
