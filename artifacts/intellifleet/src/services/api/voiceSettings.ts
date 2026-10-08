import { api } from "./client";

export interface VoiceSettings {
  voice_calls: "active" | "paused";
  changed_by: string | null;
  changed_at: string | null;
  default: "active" | "paused";
  whatsapp?: WhatsappSettings;
}

export interface WhatsappSettings {
  whatsapp: "active" | "paused";
  changed_by: string | null;
  changed_at: string | null;
  default: "active" | "paused";
}

/** Status for every logistics role. */
export function getVoiceSettings() {
  return api.get<VoiceSettings>("/api/voice/settings");
}

/** Admin only (the backend answers 403 to anyone else). */
export function setVoiceCalls(mode: "active" | "paused") {
  return api.put<VoiceSettings>("/api/admin/voice-calls", { voice_calls: mode });
}

/** Admin only (the backend answers 403 to anyone else). No environment variable involved. */
export function setWhatsapp(mode: "active" | "paused") {
  return api.put<WhatsappSettings>("/api/admin/whatsapp", { whatsapp: mode });
}
