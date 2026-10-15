// Early photo upload (SPEC 6.1): the moment a photo is taken in a sheet it starts uploading in the background with its
// upload_key, so the thumbnail can say Sending... / Sent / Saved, will send and the driver is never blocked.
// The same upload_key travels with the action, so a photo that did not finish is uploaded again by the offline queue and
// the server de-duplicates it (POST /api/driver/uploads is idempotent on upload_key). Pure: the upload call is injected.
import { classifyFailure } from "./tripErrors.ts";
import type { UploadRequest } from "./offlineQueue.ts";

export type PhotoUploadState = "sending" | "sent" | "saved";

export interface PhotoUploadRecord {
  state: PhotoUploadState;
  photo_id: number | null;
  error: string | null;
}

export interface PhotoUploader {
  start(req: UploadRequest): Promise<void>;
  get(uploadKey: string): PhotoUploadRecord | undefined;
  // upload_key -> photo_id for the keys already uploaded.
  uploadedFor(keys: string[]): Record<string, number>;
  // true while one of the keys is still uploading.
  anySending(keys: string[]): boolean;
  // Try every "saved" photo again (e.g. on the `online` event).
  retrySaved(): Promise<void>;
  subscribe(listener: () => void): () => void;
}

export function createPhotoUploader(upload: (req: UploadRequest) => Promise<{ photo_id: number }>): PhotoUploader {
  const records = new Map<string, PhotoUploadRecord>();
  const requests = new Map<string, UploadRequest>();
  const inflight = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const set = (key: string, rec: PhotoUploadRecord) => {
    records.set(key, rec);
    emit();
  };

  const run = (req: UploadRequest): Promise<void> => {
    const key = req.upload_key;
    const existing = inflight.get(key);
    if (existing) return existing;
    if (records.get(key)?.state === "sent") return Promise.resolve();
    requests.set(key, req);
    set(key, { state: "sending", photo_id: null, error: null });
    const p = upload(req)
      .then((res) => { requests.delete(key); set(key, { state: "sent", photo_id: res.photo_id, error: null }); })
      .catch((err) => set(key, { state: "saved", photo_id: null, error: classifyFailure(err).info.message }))
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };

  return {
    start: run,
    get: (key) => records.get(key),
    uploadedFor(keys) {
      const out: Record<string, number> = {};
      for (const k of keys) {
        const r = records.get(k);
        if (r?.state === "sent" && r.photo_id !== null) out[k] = r.photo_id;
      }
      return out;
    },
    anySending: (keys) => keys.some((k) => records.get(k)?.state === "sending"),
    async retrySaved() {
      const saved = [...records.entries()].filter(([, r]) => r.state === "saved").map(([k]) => requests.get(k)).filter((r): r is UploadRequest => Boolean(r));
      await Promise.all(saved.map(run));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
