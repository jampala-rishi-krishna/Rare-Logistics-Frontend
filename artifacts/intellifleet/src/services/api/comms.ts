import { api } from "./client";

export interface ApiPreferences {
  ROWID: string;
  user_id: string;
  consent: boolean;
  opt_out: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  language: string | null;
  fallback_rules_json: string | null;
}

export interface ApiMessage {
  ROWID: string;
  conversation_id: string;
  direction: string;
  channel: string;
  provider_message_id: string | null;
  template_id: string;
  content_ref: string;
  status: string;
  sent_at: string | null;
}

export interface ApiConversation {
  ROWID: string;
  subject_type: string;
  subject_id: string;
  channel: string;
  status: string;
  messages: ApiMessage[];
}

export interface ApiVoiceCall {
  ROWID: string;
  contact_id: string;
  call_state: string;
  intent: string;
  transfer_result: string;
  consent_flag: boolean;
  recording_ref: string;
}

export function getPreferences(userId: string): Promise<ApiPreferences> {
  return api.get<ApiPreferences>(`/preferences/${userId}`);
}

export function patchPreferences(
  userId: string,
  patch: Partial<{
    consent: boolean;
    optOut: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
    language: string;
    fallbackRules: unknown;
  }>,
): Promise<ApiPreferences> {
  return api.patch<ApiPreferences>(`/preferences/${userId}`, patch);
}

export function listMessages(
  filters: {
    orderId?: string;
    routeId?: string;
    vehicleId?: string;
    userId?: string;
    channel?: string;
    status?: string;
  } = {},
): Promise<ApiMessage[]> {
  return api.get<ApiMessage[]>("/messages", filters);
}

// Manual send - the backend stubs the actual provider call and simulates a
// queued -> sent -> delivered progression synchronously before responding.
export function sendMessage(message: {
  conversationId?: string;
  subjectType?: string;
  subjectId?: string;
  channel: string;
  templateId?: string;
  content?: string;
}): Promise<ApiMessage> {
  return api.post<ApiMessage>("/messages", message);
}

export function retryMessage(rowid: string): Promise<ApiMessage> {
  return api.post<ApiMessage>(`/messages/${rowid}/retry`);
}

export function getConversation(rowid: string): Promise<ApiConversation> {
  return api.get<ApiConversation>(`/conversations/${rowid}`);
}

export function postCall(contactId: string, intent?: string): Promise<ApiVoiceCall> {
  return api.post<ApiVoiceCall>("/calls", { contactId, intent });
}

export interface ApiTemplate {
  ROWID: string;
  name: string;
  channel: string;
  language: string | null;
  body: string;
  variables_json: string | null;
  version: number;
  status: string;
}

export function listTemplates(): Promise<ApiTemplate[]> {
  return api.get<ApiTemplate[]>("/templates");
}
