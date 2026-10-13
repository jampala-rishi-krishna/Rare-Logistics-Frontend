import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, RotateCcw } from "lucide-react";
import * as adminApi from "@/services/api/admin";
import DriverFormsSettings from "./DriverFormsSettings";
import { formatFallback, isDirty, sourceLabel, validateSettingInput, type AdminSetting } from "@/lib/settingsForm";

function fmtWhen(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

const message = (err: unknown) => (err instanceof Error && err.message ? err.message : "Could not save. Please try again.");

function SettingRow({ setting }: { setting: AdminSetting }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(String(setting.value));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Follow the server value after a save, reset or refetch.
  useEffect(() => setDraft(String(setting.value)), [setting.value]);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 4000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
  const save = useMutation({
    mutationFn: (value: string | number) => adminApi.saveSetting(setting.key, value),
    onSuccess: () => { setError(null); setSaved(true); void refresh(); void queryClient.invalidateQueries({ queryKey: ["zoho-usage"] }); },
    onError: (err) => { setSaved(false); setError(message(err)); },
  });
  const reset = useMutation({
    mutationFn: () => adminApi.resetSetting(setting.key),
    onSuccess: () => { setError(null); setSaved(true); void refresh(); void queryClient.invalidateQueries({ queryKey: ["zoho-usage"] }); },
    onError: (err) => { setSaved(false); setError(message(err)); },
  });

  const busy = save.isPending || reset.isPending;
  const dirty = isDirty(setting, draft);
  const submit = () => {
    const check = validateSettingInput(setting, draft);
    if (!check.ok) { setError(check.message); return; }
    setError(null);
    save.mutate(check.value);
  };
  const inputId = `setting-${setting.key}`;

  return (
    <section className="border border-[#d8d7d2] bg-white p-4" data-testid={`setting-${setting.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <label htmlFor={inputId} className="block text-sm font-semibold">{setting.label}</label>
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-[#55565a]">{setting.description}</p>
        </div>
        <span className={`shrink-0 border px-2 py-0.5 text-[11px] font-semibold ${setting.source === "admin" ? "border-[#cddfd2] bg-[#edf6f0] text-[#1e7b44]" : "border-[#d8d7d2] bg-[#f2f2ef] text-[#55565a]"}`}>
          {sourceLabel(setting.source)}
        </span>
      </div>
      <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (dirty && !busy) submit(); }}>
        <div className="flex min-w-[10rem] flex-1 items-center gap-2 sm:max-w-xs">
          <input
            id={inputId}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); setSaved(false); }}
            inputMode={setting.type === "number" ? "numeric" : "tel"}
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="min-h-[40px] w-full border border-[#d8d7d2] bg-white px-3 text-sm outline-none focus:border-black"
          />
          {setting.unit && <span className="shrink-0 text-xs text-[#77787b]">{setting.unit}</span>}
        </div>
        <button
          type="submit"
          disabled={!dirty || busy}
          className="inline-flex min-h-[40px] items-center gap-2 border border-black bg-black px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {save.isPending ? <Loader2 size={14} className="animate-spin" /> : null}Save
        </button>
        {setting.source === "admin" && (
          <button
            type="button"
            disabled={busy}
            onClick={() => reset.mutate()}
            className="inline-flex min-h-[40px] items-center gap-2 border border-[#d8d7d2] bg-white px-3 text-sm font-semibold disabled:opacity-40"
          >
            {reset.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}Reset to default
          </button>
        )}
        {saved && <span role="status" className="inline-flex items-center gap-1 text-xs font-semibold text-[#1e7b44]"><Check size={14} />Saved</span>}
      </form>
      {error && <p id={`${inputId}-error`} role="alert" className="mt-2 text-xs font-semibold text-[#86000B]">{error}</p>}
      <p className="mt-2 text-[11px] text-[#77787b]">
        {setting.source === "admin" ? `Without an override this would be ${formatFallback(setting)}. ` : ""}
        {setting.source === "admin" && setting.updated_by ? `Last saved by ${setting.updated_by}${setting.updated_at ? ` · ${fmtWhen(setting.updated_at)}` : ""}.` : ""}
        {setting.source !== "admin" ? `Currently ${formatFallback(setting)} (${sourceLabel(setting.source).toLowerCase()}).` : ""}
      </p>
    </section>
  );
}

export default function AdminSettings() {
  const query = useQuery({ queryKey: ["admin-settings"], queryFn: adminApi.listSettings, staleTime: 60_000, retry: 1 });
  return (
    <div className="space-y-3" data-testid="admin-settings">
      <p className="max-w-prose text-xs text-[#55565a]">
        Operational settings only. Secrets (Zoho, Gmail, R2, JWT, Cartrack, database) stay in the server's environment and are never stored here.
        A saved value takes effect immediately; "Reset to default" returns to the environment variable or built-in default.
      </p>
      {query.isLoading && <div className="border border-[#d8d7d2] bg-white p-4 text-sm text-[#55565a]">Loading settings…</div>}
      {query.isError && (
        <div role="alert" className="flex items-center justify-between gap-3 border border-[#f0c4c7] bg-[#fff1f2] p-4 text-sm text-[#86000B]">
          <span>{message(query.error)}</span>
          <button onClick={() => void query.refetch()} className="min-h-[36px] border border-[#86000B] px-3 text-xs font-semibold">Retry</button>
        </div>
      )}
      {query.data?.settings.map((setting) => <SettingRow key={setting.key} setting={setting} />)}
      <section aria-label="Driver app forms" className="space-y-3 pt-4" data-testid="admin-driver-forms">
        <h2 className="text-lg font-bold">Driver app forms</h2>
        <p className="max-w-prose text-xs text-[#55565a]">
          The acknowledgement checklist and the Delivery time log the driver app asks for. Saving creates a new version; the driver app uses the active one and every answer already recorded stays readable.
        </p>
        <DriverFormsSettings />
      </section>
    </div>
  );
}
