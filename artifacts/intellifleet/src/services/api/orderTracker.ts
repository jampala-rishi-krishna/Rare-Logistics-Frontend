import { api } from "./client";

export interface Fact {
  source: string;
  as_of: string | null;
  state: "recorded" | "not_recorded";
  value: unknown;
  message: string | null;
}
export interface OrderRow {
  number: string; customer: string; delivery_date: string; order_type: string;
  status: string; truck: string | null; last_update: string | null; payment: string; link: string;
  /** Stop position on the truck's trip, when the trip snapshot is in memory. */
  stop?: number | null; total_stops?: number | null;
  /** Latest recorded journey event for the list meta line, e.g. {label: "delivered", at: ISO}. */
  event?: { label: string; at: string | null } | null;
}
export interface Card extends Omit<OrderRow, "payment"> {
  id: string; sections: Record<string, Fact>; contact: string;
  /** Delivery city/area from the cached SO shipping address; null when not cached. */
  area?: string | null;
}
export interface OrderList { orders: OrderRow[]; total: number; offset: number; scope: string; coverage: string; source?: string; as_of?: string | null }
export interface Source { source: string; as_of: string | null; link: string | null; not_recorded: boolean }

/** Structured answer blocks, built server-side ONLY from tool results fetched for that answer (never model-written numbers). */
export type AnswerBlock =
  | { type: "order_table"; rows: Array<{ number: string; customer: string; status: string; reason: string | null; rejected: string | null; link: string | null }>; source: string; as_of: string | null }
  | { type: "tiles"; tiles: Array<{ label: string; value: string; tone?: "positive" | "warning" | "negative" | null }>; chip?: { label: string; tone: "positive" | "warning" | "negative" | "neutral" | "unknown" } | null; source: string; as_of: string | null }
  | { type: "not_recorded"; title: string; message: string }
  | { type: "bars"; title: string; unit: string; items: Array<{ label: string; value: number }>; source: string; as_of: string | null }
  | { type: "actions"; actions: Array<{ kind: "photos" | "open_order"; label: string; link: string }> };

export interface Answer { answer_id: string; answer: string; sources: Source[]; tools: string[]; not_recorded: boolean; blocks?: AnswerBlock[]; language?: "en" | "tl" }
export interface Filter { date_from: string; date_to: string; q?: string; status?: string; offset?: number }
const BASE = "/api/order-tracker";
export const findOrders = (filter: Filter) => api.get<OrderList>(`${BASE}/orders`, { ...filter });
export const getOrder = (number: string, filter: Filter) => api.get<Card>(`${BASE}/orders/${encodeURIComponent(number)}`, { date_from: filter.date_from, date_to: filter.date_to });
export const ask = (question: string, filter: Filter, order?: string) => api.post<Answer>(`${BASE}/ask`, { question, date_from: filter.date_from, date_to: filter.date_to, order }, undefined, 35000);
export const feedback = (answer_id: string, helpful: boolean) => api.post(`${BASE}/feedback`, { answer_id, helpful });
export const photo = (id: number) => api.download(`/api/media/${id}`, { read_only: "true" }).then(({ blob }) => blob);
