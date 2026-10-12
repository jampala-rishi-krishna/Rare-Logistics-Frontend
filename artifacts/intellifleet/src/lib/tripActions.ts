// Building and submitting crew actions: capture -> body -> online first -> queue on failure.
import { applyUploads } from "./offlineQueue.ts";
import type { QueueBlob, QueueEngine, QueueEntry, QueueKind, SyncApi } from "./offlineQueue.ts";
import { classifyFailure } from "./tripErrors.ts";
import type { ErrorInfo } from "./tripErrors.ts";
import type { PositionResult } from "./geo.ts";
import type { ActionBody, ActionResponse } from "./tripTypes.ts";

export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildActionBody(
  position: PositionResult,
  extra: Record<string, unknown> = {},
  deps: { now?: () => Date; key?: () => string } = {},
): ActionBody {
  const now = deps.now ? deps.now() : new Date();
  return {
    idempotency_key: (deps.key ?? newIdempotencyKey)(),
    client_ts: now.toISOString(),
    gps: position.gps,
    gps_denied_reason: position.gps ? null : position.gps_denied_reason,
    ...extra,
  };
}

export interface ActionSpec {
  batch_id: string;
  so_id?: string | null;
  kind: QueueKind;
  label?: string | null;
  path: string;
  body: ActionBody;
  blobs?: QueueBlob[];
}

export type SubmitOutcome =
  | { status: "done"; response: ActionResponse }
  | { status: "queued"; entry: QueueEntry }
  | { status: "rejected"; info: ErrorInfo }
  | { status: "unauthorized"; info: ErrorInfo };

export interface Submitter {
  submit(spec: ActionSpec): Promise<SubmitOutcome>;
}

// Online first; if the network fails (or the server is down) the action is queued with its
// original key and timestamp. If the batch already has queued actions the new one is queued
// behind them so the server sees them in tap order. Double taps with the same key share one call.
export function createSubmitter(deps: { engine: QueueEngine; api: SyncApi }): Submitter {
  const inflight = new Map<string, Promise<SubmitOutcome>>();

  async function run(spec: ActionSpec): Promise<SubmitOutcome> {
    const { engine, api } = deps;
    const body = spec.body as Record<string, unknown>;
    if (engine.hasActiveForBatch(spec.batch_id)) {
      const entry = await engine.enqueue({ ...spec, body });
      void engine.sync();
      return { status: "queued", entry };
    }
    const uploaded: Record<string, number> = {};
    try {
      for (const b of spec.blobs ?? []) {
        const res = await api.upload({ blob: b.blob, filename: b.filename, batch_id: spec.batch_id, so_id: spec.so_id ?? null, field_key: b.field_key, upload_key: b.upload_key });
        uploaded[b.upload_key] = res.photo_id;
      }
      const response = await api.post(spec.path, applyUploads(body, spec.blobs, uploaded));
      return { status: "done", response };
    } catch (err) {
      const { kind, info } = classifyFailure(err);
      if (kind === "unauthorized") return { status: "unauthorized", info };
      if (kind === "needs_attention") return { status: "rejected", info };
      const entry = await engine.enqueue({ ...spec, body, uploaded, attempts: 1, error: info.message });
      return { status: "queued", entry };
    }
  }

  return {
    submit(spec) {
      const key = spec.body.idempotency_key;
      const existing = inflight.get(key);
      if (existing) return existing;
      const p = run(spec).finally(() => {
        inflight.delete(key);
      });
      inflight.set(key, p);
      return p;
    },
  };
}
