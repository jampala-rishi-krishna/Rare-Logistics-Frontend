// Offline action queue for the driver app (docs/TRIP_WORKFLOW.md section 10).
// Pure logic: storage and API are injected so it runs in node tests with a fake clock.
import { classifyFailure } from "./tripErrors.ts";
import type { ActionResponse } from "./tripTypes.ts";

export type QueueKind = "acknowledge" | "start" | "check_in" | "check_out" | "end" | "handover";
export type QueueStatus = "pending" | "syncing" | "needs_attention" | "done";

export interface QueueBlob {
  // Where the uploaded photo_id goes: an answers key (checkout) or "item:<item_id>" (acknowledge).
  field_key: string;
  upload_key: string;
  blob: Blob;
  filename: string;
}

export interface QueueEntry {
  id: string;
  seq: number;
  batch_id: string;
  so_id?: string | null;
  kind: QueueKind;
  // Human label for the sync panel, e.g. "Acknowledge SO-123".
  label?: string | null;
  path: string;
  body: Record<string, unknown>;
  blobs?: QueueBlob[];
  // upload_key -> photo_id for blobs already uploaded (so a retry never re-uploads).
  uploaded?: Record<string, number>;
  created_at: number;
  attempts: number;
  status: QueueStatus;
  error?: string | null;
  code?: string | null;
  next_attempt_at?: number | null;
}

export interface CacheRecord {
  saved_at: number;
  data: unknown;
}

export interface QueueStorage {
  loadEntries(): Promise<QueueEntry[]>;
  saveEntry(entry: QueueEntry): Promise<void>;
  removeEntry(id: string): Promise<void>;
  getCache(key: string): Promise<CacheRecord | undefined>;
  setCache(key: string, record: CacheRecord): Promise<void>;
}

export function createMemoryStorage(): QueueStorage & { entries: Map<string, QueueEntry>; cache: Map<string, CacheRecord> } {
  const entries = new Map<string, QueueEntry>();
  const cache = new Map<string, CacheRecord>();
  return {
    entries,
    cache,
    async loadEntries() {
      return [...entries.values()].map((e) => ({ ...e }));
    },
    async saveEntry(entry) {
      entries.set(entry.id, { ...entry });
    },
    async removeEntry(id) {
      entries.delete(id);
    },
    async getCache(key) {
      return cache.get(key);
    },
    async setCache(key, record) {
      cache.set(key, record);
    },
  };
}

export interface UploadRequest {
  blob: Blob;
  filename: string;
  batch_id: string;
  so_id?: string | null;
  field_key: string;
  upload_key: string;
}

export interface SyncApi {
  post(path: string, body: Record<string, unknown>): Promise<ActionResponse>;
  upload(req: UploadRequest): Promise<{ photo_id: number }>;
}

export function backoffMs(attempts: number): number {
  const n = Math.max(1, attempts);
  return Math.min(5 * 60_000, 2000 * 2 ** (n - 1));
}

// Returns a copy of `body` with the uploaded photo ids written into `answers`.
export function applyUploads(body: Record<string, unknown>, blobs: QueueBlob[] | undefined, uploaded: Record<string, number> | undefined): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  if (!blobs || !uploaded) return out;
  for (const b of blobs) {
    const photoId = uploaded[b.upload_key];
    if (photoId === undefined) continue;
    const answers = out.answers;
    if (Array.isArray(answers)) {
      const m = /^item:(.+)$/.exec(b.field_key);
      if (!m) continue;
      for (const a of answers as Array<Record<string, unknown>>) {
        if (String(a.item_id) === m[1]) a.photo_id = photoId;
      }
    } else if (answers && typeof answers === "object") {
      (answers as Record<string, unknown>)[b.field_key] = photoId;
    }
  }
  return out;
}

export interface EnqueueInput {
  batch_id: string;
  so_id?: string | null;
  kind: QueueKind;
  label?: string | null;
  path: string;
  body: Record<string, unknown>;
  blobs?: QueueBlob[];
  uploaded?: Record<string, number>;
  attempts?: number;
  error?: string | null;
}

export interface SyncSummary {
  done: number;
  needs_attention: number;
  stopped: "offline" | "unauthorized" | null;
}

export interface EngineDeps {
  storage: QueueStorage;
  api: SyncApi;
  now?: () => number;
  newId?: () => string;
  onUnauthorized?: () => void;
  // Called after an entry is accepted by the server (2xx, already_done or replayed).
  onResult?: (entry: QueueEntry, response: ActionResponse) => void;
}

export interface QueueEngine {
  load(): Promise<void>;
  getSnapshot(): QueueEntry[];
  subscribe(listener: () => void): () => void;
  enqueue(input: EnqueueInput): Promise<QueueEntry>;
  sync(opts?: { force?: boolean }): Promise<SyncSummary>;
  retry(id: string): Promise<void>;
  dismiss(id: string): Promise<void>;
  hasWork(): boolean;
  hasActiveForBatch(batchId: string): boolean;
}

function fallbackId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createQueueEngine(deps: EngineDeps): QueueEngine {
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? fallbackId;
  let list: QueueEntry[] = [];
  let seqCounter = 0;
  const listeners = new Set<() => void>();
  let running: Promise<SyncSummary> | null = null;
  let rerun: { force: boolean } | null = null;

  const emit = () => {
    list = [...list];
    for (const l of listeners) l();
  };

  const replace = async (entry: QueueEntry) => {
    list = list.map((e) => (e.id === entry.id ? entry : e));
    await deps.storage.saveEntry(entry);
    emit();
  };

  const remove = async (id: string) => {
    list = list.filter((e) => e.id !== id);
    await deps.storage.removeEntry(id);
    emit();
  };

  async function processEntry(entry: QueueEntry): Promise<"ok" | "attention" | "blocked" | "offline" | "unauthorized"> {
    let current: QueueEntry = { ...entry, status: "syncing", attempts: entry.attempts + 1, error: null };
    await replace(current);

    const fail = async (err: unknown): Promise<"attention" | "blocked" | "offline" | "unauthorized"> => {
      const { kind, info } = classifyFailure(err);
      if (kind === "unauthorized") {
        // Not the entry's fault: put it back untouched and stop.
        await replace({ ...current, status: "pending", attempts: entry.attempts, error: info.message });
        deps.onUnauthorized?.();
        return "unauthorized";
      }
      if (kind === "needs_attention") {
        await replace({ ...current, status: "needs_attention", error: info.message, code: info.code, next_attempt_at: null });
        return "attention";
      }
      await replace({ ...current, status: "pending", error: info.message, code: info.code, next_attempt_at: now() + backoffMs(current.attempts) });
      return kind === "network" ? "offline" : "blocked";
    };

    // 1. upload queued blobs first (retry-safe on the server via upload_key).
    const uploaded: Record<string, number> = { ...(current.uploaded ?? {}) };
    for (const b of current.blobs ?? []) {
      if (uploaded[b.upload_key] !== undefined) continue;
      try {
        const res = await deps.api.upload({ blob: b.blob, filename: b.filename, batch_id: current.batch_id, so_id: current.so_id ?? null, field_key: b.field_key, upload_key: b.upload_key });
        uploaded[b.upload_key] = res.photo_id;
        current = { ...current, uploaded: { ...uploaded } };
        await replace(current);
      } catch (err) {
        return fail(err);
      }
    }

    // 2. POST the action with the ORIGINAL idempotency_key / client_ts.
    try {
      const response = await deps.api.post(current.path, applyUploads(current.body, current.blobs, uploaded));
      await remove(current.id);
      deps.onResult?.(current, response);
      return "ok";
    } catch (err) {
      return fail(err);
    }
  }

  async function runOnce(force: boolean): Promise<SyncSummary> {
    const summary: SyncSummary = { done: 0, needs_attention: 0, stopped: null };
    const blocked = new Set<string>();
    const ordered = [...list].filter((e) => e.status === "pending").sort((a, b) => a.seq - b.seq);
    for (const entry of ordered) {
      if (blocked.has(entry.batch_id)) continue;
      const live = list.find((e) => e.id === entry.id);
      if (!live || live.status !== "pending") continue;
      if (!force && live.next_attempt_at && now() < live.next_attempt_at) {
        blocked.add(live.batch_id);
        continue;
      }
      const result = await processEntry(live);
      if (result === "ok") summary.done += 1;
      else if (result === "attention") summary.needs_attention += 1;
      else if (result === "blocked") blocked.add(live.batch_id);
      else {
        summary.stopped = result === "offline" ? "offline" : "unauthorized";
        return summary;
      }
    }
    return summary;
  }

  return {
    async load() {
      const stored = await deps.storage.loadEntries();
      list = stored
        .map((e) => (e.status === "syncing" ? { ...e, status: "pending" as const } : e))
        .filter((e) => e.status !== "done")
        .sort((a, b) => a.seq - b.seq);
      seqCounter = list.reduce((m, e) => Math.max(m, e.seq), 0);
      emit();
    },
    getSnapshot: () => list,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async enqueue(input) {
      const key = input.body.idempotency_key;
      if (typeof key === "string") {
        const dup = list.find((e) => e.body.idempotency_key === key);
        if (dup) return dup;
      }
      seqCounter += 1;
      const entry: QueueEntry = {
        id: newId(),
        seq: seqCounter,
        batch_id: input.batch_id,
        so_id: input.so_id ?? null,
        kind: input.kind,
        label: input.label ?? null,
        path: input.path,
        body: input.body,
        blobs: input.blobs && input.blobs.length ? input.blobs : undefined,
        uploaded: input.uploaded,
        created_at: now(),
        attempts: input.attempts ?? 0,
        status: "pending",
        error: input.error ?? null,
        next_attempt_at: null,
      };
      list = [...list, entry];
      await deps.storage.saveEntry(entry);
      emit();
      return entry;
    },
    sync(opts) {
      const force = Boolean(opts?.force);
      if (running) {
        rerun = { force: force || Boolean(rerun?.force) };
        return running;
      }
      running = (async () => {
        let summary = await runOnce(force);
        while (rerun && !summary.stopped) {
          const next = rerun;
          rerun = null;
          const more = await runOnce(next.force);
          summary = { done: summary.done + more.done, needs_attention: summary.needs_attention + more.needs_attention, stopped: more.stopped };
        }
        rerun = null;
        return summary;
      })().finally(() => {
        running = null;
      });
      return running;
    },
    async retry(id) {
      const e = list.find((x) => x.id === id);
      if (!e || e.status !== "needs_attention") return;
      await replace({ ...e, status: "pending", attempts: 0, error: null, code: null, next_attempt_at: null });
    },
    async dismiss(id) {
      const e = list.find((x) => x.id === id);
      if (!e || e.status === "syncing") return;
      await remove(id);
    },
    hasWork: () => list.some((e) => e.status === "pending" || e.status === "syncing"),
    hasActiveForBatch: (batchId) => list.some((e) => e.batch_id === batchId && (e.status === "pending" || e.status === "syncing")),
  };
}
