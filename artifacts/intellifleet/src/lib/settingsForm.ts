// Pure logic for Admin > Settings: the same bounds the server enforces (services/app_settings.py), so the form can
// explain a problem before the round trip. The server stays the authority and its message is shown if it disagrees.

export type SettingSource = "admin" | "env" | "default";

export interface AdminSetting {
  key: string;
  label: string;
  description: string;
  type: "number" | "text";
  unit: string | null;
  min: number | null;
  max: number | null;
  value: number | string;
  source: SettingSource;
  fallback: number | string;
  updated_by: string | null;
  updated_at: string | null;
}

const PHONE = /^[0-9+()\-\s]{0,32}$/;

export type SettingCheck = { ok: true; value: number | string } | { ok: false; message: string };

export function validateSettingInput(setting: Pick<AdminSetting, "label" | "type" | "min" | "max"> & { key?: string }, raw: string): SettingCheck {
  if (setting.type === "text") {
    const text = raw.trim();
    if (setting.key?.startsWith("PICKUP_")) {
      if (setting.key === "PICKUP_EMAIL_TIME" && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)) return {ok:false,message:"Use HH:MM in Asia/Manila."};
      if (setting.key !== "PICKUP_EMAIL_TIME" && text && text.split(",").some(v => !/^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(v.trim()))) return {ok:false,message:"Enter comma-separated email addresses."};
      return {ok:true,value:text};
    }
    if (!PHONE.test(text)) return { ok: false, message: `${setting.label} may contain only digits, +, -, spaces and brackets (max 32 characters).` };
    return { ok: true, value: text };
  }
  const text = raw.trim();
  if (!/^-?\d+$/.test(text)) return { ok: false, message: `${setting.label} must be a whole number.` };
  const number = Number(text);
  if (setting.min !== null && number < setting.min) return { ok: false, message: `${setting.label} must be at least ${setting.min}.` };
  if (setting.max !== null && number > setting.max) return { ok: false, message: `${setting.label} must be at most ${setting.max}.` };
  return { ok: true, value: number };
}

// The draft differs from what is currently in effect (so Save is only offered for a real change).
export function isDirty(setting: Pick<AdminSetting, "value">, draft: string): boolean {
  return draft.trim() !== String(setting.value);
}

export function sourceLabel(source: SettingSource): string {
  if (source === "admin") return "Saved in Settings";
  if (source === "env") return "From environment variable";
  return "Built-in default";
}

export function formatFallback(setting: Pick<AdminSetting, "fallback" | "unit" | "type">): string {
  if (setting.type === "text") return setting.fallback === "" ? "(empty)" : String(setting.fallback);
  return setting.unit ? `${setting.fallback} ${setting.unit}` : String(setting.fallback);
}
