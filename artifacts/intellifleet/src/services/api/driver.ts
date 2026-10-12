import { api } from "./client";
import type {
  ActionBody,
  ActionResponse,
  BatchDetail,
  DriverHistory,
  DriverMe,
  DriverToday,
  HistoryRange,
  Officer,
  RouteInfo,
  Templates,
  Timeline,
} from "../../lib/tripTypes.ts";

export type * from "../../lib/tripTypes.ts";

// Driver portal API. Crew (driver/helper) call these with no extra params; admins must pass the
// staff id of the person they are viewing as `driverId` (sent as ?driver_id=) on every READ call.
// Admins never perform crew actions, so action calls take no driver id.

function scope(driverId?: string | null): Record<string, string | undefined> {
  return driverId ? { driver_id: driverId } : {};
}

const base = (batchId: string) => `/api/driver/batches/${encodeURIComponent(batchId)}`;

export function getMe(driverId?: string | null): Promise<DriverMe> {
  return api.get<DriverMe>("/api/driver/me", scope(driverId));
}

export function getToday(driverId?: string | null): Promise<DriverToday> {
  return api.get<DriverToday>("/api/driver/today", scope(driverId));
}

export function getHistory(range: HistoryRange, driverId?: string | null): Promise<DriverHistory> {
  const query: Record<string, string | number | undefined> = { ...scope(driverId) };
  if ("days" in range) query.days = range.days;
  else {
    query.from = range.from;
    query.to = range.to;
  }
  return api.get<DriverHistory>("/api/driver/history", query);
}

export function getAssignment(batchId: string, driverId?: string | null): Promise<BatchDetail> {
  return api.get<BatchDetail>(`/api/driver/assignments/${encodeURIComponent(batchId)}`, scope(driverId));
}

export function getTemplates(driverId?: string | null): Promise<Templates> {
  return api.get<Templates>("/api/driver/templates", scope(driverId));
}

export function getOfficers(driverId?: string | null): Promise<Officer[]> {
  return api.get<Officer[]>("/api/driver/officers", scope(driverId));
}

export function getRoute(batchId: string, driverId?: string | null): Promise<RouteInfo> {
  return api.get<RouteInfo>(`${base(batchId)}/route`, scope(driverId));
}

export function getTimeline(batchId: string, driverId?: string | null): Promise<Timeline> {
  return api.get<Timeline>(`${base(batchId)}/timeline`, scope(driverId));
}

// ---- action paths (also used by the offline queue, which stores the path) ----
export const paths = {
  acknowledge: (batchId: string, soId: string) => `${base(batchId)}/orders/${encodeURIComponent(soId)}/acknowledge`,
  start: (batchId: string) => `${base(batchId)}/start`,
  checkIn: (batchId: string, soId: string) => `${base(batchId)}/orders/${encodeURIComponent(soId)}/check-in`,
  checkOut: (batchId: string, soId: string) => `${base(batchId)}/orders/${encodeURIComponent(soId)}/check-out`,
  end: (batchId: string) => `${base(batchId)}/end`,
  handover: (batchId: string) => `${base(batchId)}/handover`,
};

// Generic POST of an already-built action body (idempotency_key / client_ts / gps included).
export function postAction(path: string, body: unknown): Promise<ActionResponse> {
  return api.post<ActionResponse>(path, body);
}

export const acknowledge = (batchId: string, soId: string, body: ActionBody) => postAction(paths.acknowledge(batchId, soId), body);
export const start = (batchId: string, body: ActionBody) => postAction(paths.start(batchId), body);
export const checkIn = (batchId: string, soId: string, body: ActionBody) => postAction(paths.checkIn(batchId, soId), body);
export const checkOut = (batchId: string, soId: string, body: ActionBody) => postAction(paths.checkOut(batchId, soId), body);
export const end = (batchId: string, body: ActionBody) => postAction(paths.end(batchId), body);
export const handover = (batchId: string, body: ActionBody) => postAction(paths.handover(batchId), body);

export interface UploadFields {
  blob: Blob;
  filename: string;
  batch_id: string;
  so_id?: string | null;
  field_key: string;
  upload_key: string;
}

export interface UploadResult {
  photo_id: number;
  content_type?: string;
  size_bytes?: number;
}

export function uploadPhoto(fields: UploadFields): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", fields.blob, fields.filename);
  form.append("batch_id", fields.batch_id);
  if (fields.so_id) form.append("so_id", fields.so_id);
  form.append("field_key", fields.field_key);
  form.append("upload_key", fields.upload_key);
  return api.postForm<UploadResult>("/api/driver/uploads", form);
}

// Authenticated media URL for <img>: /api/media/{id} needs the bearer token, so images are
// fetched through fetchMediaBlob instead of a bare src.
export async function fetchMediaBlob(photoId: number | string): Promise<Blob> {
  const { blob } = await api.download(`/api/media/${encodeURIComponent(String(photoId))}`);
  return blob;
}

// ---- errors (pure helpers live in lib/tripErrors.ts) ----
export { errorInfo, errorMessage, classifyFailure } from "../../lib/tripErrors.ts";
export type { ErrorInfo, FailureKind } from "../../lib/tripErrors.ts";
