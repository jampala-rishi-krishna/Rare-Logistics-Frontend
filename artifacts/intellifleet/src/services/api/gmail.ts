import { api } from "./client";

export interface GmailMessage {
  id: string;
  thread_id: string;
  from: string | null;
  to: string | null;
  subject: string | null;
  snippet: string | null;
  body: string;
  body_html: string;
  sent_at: string | null;
  is_sent: boolean;
  is_unread: boolean;
}

export interface GmailThread {
  thread_id: string;
  subject: string;
  participants: string[];
  message_count: number;
  last_message_at: string | null;
  has_unread: boolean;
  messages: GmailMessage[];
}

export interface GmailTodayResponse {
  date: string;
  threads: GmailThread[];
}

export function listTodayThreads(date?: string): Promise<GmailTodayResponse> {
  return api.get<GmailTodayResponse>(`/api/gmail/messages/today${date ? `?selected_date=${encodeURIComponent(date)}` : ""}`);
}

export function gmailStatus(): Promise<{ connected: boolean }> {
  return api.get<{ connected: boolean }>("/api/gmail/status");
}
