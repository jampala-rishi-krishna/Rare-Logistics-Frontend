import { api } from "./client";

export interface StaffMember {
  id: number;
  name: string;
  title: string | null;
  warehouse: string | null;
  email: string | null;
  phone: string | null;
  active: boolean;
}

export interface CustomerContact {
  id: number;
  zoho_customer_id: string | null;
  customer_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
}

export interface DispatchTemplate {
  id: number;
  name: string;
  audience: "driver" | "customer" | "internal";
  channel: "email" | "sms" | "whatsapp" | "voice";
  subject: string | null;
  body: string;
  active: boolean;
}

export interface DispatchConversation {
  recipient_name: string | null;
  recipient_contact: string | null;
  audience: string;
  channels: string[];
  message_count: number;
  last_status: string;
  last_message_at: string;
  last_trigger_event: string | null;
}

export interface DispatchMessage {
  id: number;
  audience: string;
  recipient_name: string | null;
  recipient_contact: string | null;
  channel: string;
  template_name: string | null;
  trigger_event: string | null;
  related_so_number: string | null;
  body: string | null;
  status: string;
  provider_message_id: string | null;
  sent_at: string | null;
  created_at: string;
}

export function listStaff(warehouse?: string): Promise<StaffMember[]> {
  return api.get<StaffMember[]>("/api/dispatch/staff", warehouse ? { warehouse } : undefined);
}

export function listCustomerContacts(search?: string): Promise<CustomerContact[]> {
  return api.get<CustomerContact[]>("/api/dispatch/customers", search ? { search } : undefined);
}

export function createCustomerContact(body: Partial<CustomerContact>): Promise<CustomerContact> {
  return api.post<CustomerContact>("/api/dispatch/customers", body);
}

export function listTemplates(audience?: string): Promise<DispatchTemplate[]> {
  return api.get<DispatchTemplate[]>("/api/dispatch/templates", audience ? { audience } : undefined);
}

export function listConversations(): Promise<DispatchConversation[]> {
  return api.get<DispatchConversation[]>("/api/dispatch/conversations");
}

export function listMessages(recipientContact?: string): Promise<DispatchMessage[]> {
  return api.get<DispatchMessage[]>("/api/dispatch/messages", recipientContact ? { recipient_contact: recipientContact } : undefined);
}

export interface SendMessageBody {
  audience: "driver" | "customer" | "internal";
  recipient_id?: number;
  recipient_name?: string;
  recipient_email?: string;
  recipient_phone?: string;
  channels?: string[];
  template_name?: string;
  subject?: string;
  body?: string;
  variables?: Record<string, string>;
  trigger_event?: string;
  related_so_number?: string;
  severity?: "critical" | "normal";
}

export function sendMessage(body: SendMessageBody): Promise<{ messages: DispatchMessage[] }> {
  return api.post<{ messages: DispatchMessage[] }>("/api/dispatch/send", body);
}

export interface N8nConversation {
  channel?: string;
  contact?: string;
  driverName?: string;
  truckPlate?: string;
  warehouse?: string;
  soNumbers?: string[];
  conversationStage?: string;
  assignmentConfirmed?: boolean;
  humanEscalated?: boolean;
  callSummary?: string;
  lastUpdated?: string;
  lastMessageAt?: string;
  messageCount?: number;
  messages?: { role: string; content: string; ts?: string }[];
}

export function listN8nConversations(channel: "whatsapp" | "sms" | "voice") {
  return api.get<{ count: number; conversations: N8nConversation[] }>(`/api/dispatch/n8n-conversations/${channel}`);
}

// Logistics email conversations, built from Gmail threads by the backend (no n8n).
export function listEmailConversations() {
  return api.get<{ count: number; conversations: N8nConversation[] }>("/api/communications/email/conversations");
}

export interface VoiceCall {
  callId?: string;
  id?: string;
  driverName?: string;
  truckPlate?: string;
  callStatus?: string;
  status?: string;
  callTimestamp?: string;
  startedAt?: string;
  timestamp?: string;
  duration?: number | string;
  durationSeconds?: number;
  assignmentConfirmed?: boolean;
  humanEscalated?: boolean;
  messages?: { role: string; content: string; ts?: string }[];
  callSummary?: string;
  soNumbers?: string[];
}

export function getVoiceCallDetail(callId: string) {
  return api.get<any>(`/api/dispatch/voice-call-detail/${encodeURIComponent(callId)}`);
}

export function getVoiceRecording(callId: string) {
  return api.download(`/api/dispatch/voice-recording/${encodeURIComponent(callId)}`);
}

export interface CommsOverviewMetrics {
  messagesSentThisMonth: Record<string, number>;
  period: { type: "month"; start: string };
  responseRate: Record<string, number>;
  avgReplyTimeMinutes: Record<string, number | null>;
  needsAttentionCount: number;
  confirmedVsUnconfirmed: { confirmed: number; unconfirmed: number };
  channels: { channel: string; messagesSentThisMonth: number; responseRate: number; avgReplyTimeMinutes: number | null; needsAttentionCount: number; confirmed: number; unconfirmed: number; error?: string }[];
  recentActivity: { channel: string; driverName?: string; truckPlate?: string; lastMessageRole: string; lastMessagePreview: string; ts?: string; conversationStage?: string }[];
  attentionDetail: { channel: string; driverName?: string; truckPlate?: string; soNumbers: string[]; conversationStage?: string; lastUpdated?: string; reasonPreview: string }[];
}

export function getCommsOverview() {
  return api.get<CommsOverviewMetrics>("/api/dispatch/comms-overview");
}

export interface WhatsAppOutboundLog {
  sid: string;
  date_created: string | null;
  date_sent: string | null;
  to: string;
  status: string;
  error_code: number | null;
  error_message: string | null;
  price: string | null;
  body: string;
}
export interface WhatsAppInboundLog {
  sid: string;
  from: string;
  date: string | null;
  body: string;
}
export interface WhatsAppLogs {
  since: string;
  from: string;
  fetched_at: string;
  cached: boolean;
  outbound: WhatsAppOutboundLog[];
  inbound: WhatsAppInboundLog[];
}

export function getWhatsAppLogs(since: string) {
  return api.get<WhatsAppLogs>("/api/communications/whatsapp/logs", { since });
}
