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

export type GmailFolder = "inbox" | "sent";

export interface GmailTodayResponse {
  date: string;
  folder: GmailFolder;
  // Always "logistics": the backend only returns the Logistics / Logistics/Sent labels.
  scope: "logistics";
  threads: GmailThread[];
  missingLabels?: string[];
}

// Logistics email only: the backend filters by the existing Gmail labels
// (inbox = Logistics, sent = Logistics/Sent), never the whole mailbox.
export function listLogisticsThreads(folder: GmailFolder, date?: string): Promise<GmailTodayResponse> {
  const params = new URLSearchParams({ folder });
  if (date) params.set("selected_date", date);
  return api.get<GmailTodayResponse>(`/api/gmail/messages/today?${params.toString()}`);
}

export function gmailStatus(): Promise<{ connected: boolean }> {
  return api.get<{ connected: boolean }>("/api/gmail/status");
}
