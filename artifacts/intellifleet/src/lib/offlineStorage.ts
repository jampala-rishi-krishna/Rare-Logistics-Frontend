// Browser storage adapters for the offline queue: IndexedDB (blobs stored natively), with a
// localStorage fallback (blobs encoded as data URLs) and finally in-memory.
import { createMemoryStorage } from "./offlineQueue.ts";
import type { CacheRecord, QueueEntry, QueueStorage } from "./offlineQueue.ts";

const DB_NAME = "intellifleet-driver";
const DB_VERSION = 1;
const QUEUE_STORE = "queue";
const CACHE_STORE = "cache";

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export function openIndexedDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

export function createIndexedDbStorage(db: IDBDatabase): QueueStorage {
  const store = (name: string, mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name);
  return {
    async loadEntries() {
      return (await reqToPromise(store(QUEUE_STORE, "readonly").getAll())) as QueueEntry[];
    },
    async saveEntry(entry) {
      await reqToPromise(store(QUEUE_STORE, "readwrite").put(entry));
    },
    async removeEntry(id) {
      await reqToPromise(store(QUEUE_STORE, "readwrite").delete(id));
    },
    async getCache(key) {
      return (await reqToPromise(store(CACHE_STORE, "readonly").get(key))) as CacheRecord | undefined;
    },
    async setCache(key, record) {
      await reqToPromise(store(CACHE_STORE, "readwrite").put(record, key));
    },
  };
}

// ---- localStorage fallback ----

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(url: string): Promise<Blob> {
  return (await fetch(url)).blob();
}

type StoredBlob = { field_key: string; upload_key: string; filename: string; data_url: string };
type StoredEntry = Omit<QueueEntry, "blobs"> & { blobs?: StoredBlob[] };

export function createLocalStorageStorage(ls: Pick<Storage, "getItem" | "setItem" | "removeItem">): QueueStorage {
  const QUEUE_KEY = "if-driver-queue";
  const readAll = (): StoredEntry[] => {
    try {
      const raw = ls.getItem(QUEUE_KEY);
      return raw ? (JSON.parse(raw) as StoredEntry[]) : [];
    } catch {
      return [];
    }
  };
  const writeAll = (entries: StoredEntry[]) => ls.setItem(QUEUE_KEY, JSON.stringify(entries));
  return {
    async loadEntries() {
      const out: QueueEntry[] = [];
      for (const e of readAll()) {
        const blobs = e.blobs
          ? await Promise.all(e.blobs.map(async (b) => ({ field_key: b.field_key, upload_key: b.upload_key, filename: b.filename, blob: await dataUrlToBlob(b.data_url) })))
          : undefined;
        out.push({ ...e, blobs });
      }
      return out;
    },
    async saveEntry(entry) {
      const blobs = entry.blobs
        ? await Promise.all(entry.blobs.map(async (b) => ({ field_key: b.field_key, upload_key: b.upload_key, filename: b.filename, data_url: await blobToDataUrl(b.blob) })))
        : undefined;
      const stored: StoredEntry = { ...entry, blobs };
      const all = readAll().filter((e) => e.id !== entry.id);
      all.push(stored);
      writeAll(all);
    },
    async removeEntry(id) {
      writeAll(readAll().filter((e) => e.id !== id));
    },
    async getCache(key) {
      try {
        const raw = ls.getItem(`if-driver-cache:${key}`);
        return raw ? (JSON.parse(raw) as CacheRecord) : undefined;
      } catch {
        return undefined;
      }
    },
    async setCache(key, record) {
      try {
        ls.setItem(`if-driver-cache:${key}`, JSON.stringify(record));
      } catch {
        // quota: caching is best effort
      }
    },
  };
}

export type StorageKind = "indexeddb" | "localstorage" | "memory";

export async function openBestStorage(): Promise<{ storage: QueueStorage; kind: StorageKind }> {
  try {
    if (typeof indexedDB !== "undefined" && indexedDB) {
      const db = await openIndexedDb(indexedDB);
      return { storage: createIndexedDbStorage(db), kind: "indexeddb" };
    }
  } catch {
    // fall through (private mode, blocked, ...)
  }
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("if-driver-probe", "1");
      localStorage.removeItem("if-driver-probe");
      return { storage: createLocalStorageStorage(localStorage), kind: "localstorage" };
    }
  } catch {
    // fall through
  }
  return { storage: createMemoryStorage(), kind: "memory" };
}
