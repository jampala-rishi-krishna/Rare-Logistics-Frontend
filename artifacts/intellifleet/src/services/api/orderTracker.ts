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
}
export interface Card extends Omit<OrderRow, "payment"> {
  id: string; sections: Record<string, Fact>; contact: string;
}
export interface Source { source: string; as_of: string | null; link: string | null; not_recorded: boolean }
export interface Answer { answer_id: string; answer: string; sources: Source[]; tools: string[]; not_recorded: boolean }
export interface Filter { date_from: string; date_to: string; q?: string; status?: string; offset?: number }
const BASE = "/api/order-tracker";
export const findOrders = (filter: Filter) => api.get<{ orders: OrderRow[]; total: number; offset: number; scope: string; coverage: string }>(`${BASE}/orders`, { ...filter });
export const getOrder = (number: string, filter: Filter) => api.get<Card>(`${BASE}/orders/${encodeURIComponent(number)}`, { date_from: filter.date_from, date_to: filter.date_to });
export const ask = (question: string, filter: Filter, order?: string) => api.post<Answer>(`${BASE}/ask`, { question, date_from: filter.date_from, date_to: filter.date_to, order }, undefined, 35000);
export const feedback = (answer_id: string, helpful: boolean) => api.post(`${BASE}/feedback`, { answer_id, helpful });
export const photo = (id: number) => api.download(`/api/media/${id}`, { read_only: "true" }).then(({ blob }) => blob);
