// What the sync pill on the driver screens says. Never "success" before the server confirmed: only a server-confirmed result shows "Synced".
import type { QueueEntry } from "./offlineQueue.ts";

export type SyncKind = "idle" | "saved_locally" | "pending" | "syncing" | "failed" | "synced";

export interface SyncBadge {
  kind: SyncKind;
  count: number;
  text: string;
}

export const SYNCED_FLASH_MS = 4000;

export function entryStatusLabel(entry: Pick<QueueEntry, "status" | "attempts">): string {
  if (entry.status === "done") return "Synced";
  if (entry.status === "needs_attention") return "Failed";
  if (entry.status === "syncing") return "Syncing...";
  return entry.attempts > 0 ? "Pending sync" : "Saved locally";
}

// Priority: failed > syncing > pending sync > saved locally > (recently) synced > nothing.
export function syncBadge(entries: Array<Pick<QueueEntry, "status" | "attempts">>, lastConfirmedAt: number | null, now: number): SyncBadge {
  const failed = entries.filter((e) => e.status === "needs_attention").length;
  if (failed > 0) return { kind: "failed", count: failed, text: `Failed (${failed})` };
  const syncing = entries.filter((e) => e.status === "syncing").length;
  if (syncing > 0) return { kind: "syncing", count: syncing, text: "Syncing..." };
  const waiting = entries.filter((e) => e.status === "pending");
  const retried = waiting.filter((e) => e.attempts > 0).length;
  if (retried > 0) return { kind: "pending", count: waiting.length, text: `Pending sync (${waiting.length})` };
  if (waiting.length > 0) return { kind: "saved_locally", count: waiting.length, text: `Saved locally (${waiting.length})` };
  if (lastConfirmedAt !== null && now - lastConfirmedAt < SYNCED_FLASH_MS) return { kind: "synced", count: 0, text: "Synced" };
  return { kind: "idle", count: 0, text: "" };
}
