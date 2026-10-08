import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PauseCircle, PlayCircle } from "lucide-react";
import * as voiceApi from "@/services/api/voiceSettings";
import * as authApi from "@/services/api/auth";

const SETTINGS_KEY = ["voice-calls-settings"];

/** Current master-switch state. Falls back to "paused" (the server default) while loading or on error. */
export function useVoiceSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: voiceApi.getVoiceSettings,
    refetchInterval: 30000,
    staleTime: 10000,
    retry: false,
  });
}

/** Amber banner shown while AI driver calls are paused (Communications -> Voice, assignment panel). */
export function VoicePausedBanner({ className = "" }: { className?: string }) {
  const settings = useVoiceSettings();
  if (settings.data?.voice_calls !== "paused") return null; // active, or not known yet: show nothing rather than a wrong state
  return (
    <div role="status" data-testid="voice-paused-banner" className={`flex items-center gap-2 border border-[#e6c36a] bg-[#fff6dd] px-4 py-2.5 text-sm font-medium text-[#6b4a00] ${className}`}>
      <PauseCircle size={16} className="shrink-0" />
      AI voice calls paused — drivers will not receive AI calls. Email, WhatsApp and SMS are unaffected.
    </div>
  );
}

function when(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
}

/** "AI driver calls: Paused / Active". Only admins get the switch; everyone else sees the status. */
export function VoiceCallsControl() {
  const client = useQueryClient();
  const settings = useVoiceSettings();
  const session = useQuery({ queryKey: ["session-role"], queryFn: authApi.getSession, staleTime: 5 * 60 * 1000, retry: false });
  const isAdmin = session.data?.user?.role?.toLowerCase() === "admin";
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const active = settings.data?.voice_calls === "active";
  const change = useMutation({
    mutationFn: (next: "active" | "paused") => voiceApi.setVoiceCalls(next),
    onSuccess: (data) => {
      client.setQueryData(SETTINGS_KEY, data);
      setError("");
      setConfirming(false);
    },
    onError: (err: any) => setError(err?.message || "Could not change the setting."),
  });
  const toggle = () => {
    if (active) change.mutate("paused"); // pausing is always immediate
    else setConfirming(true); // resuming needs confirmation
  };
  return (
    <section data-testid="voice-calls-control" className="flex flex-wrap items-center justify-between gap-4 border border-[#e4e3df] bg-white p-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold">AI driver calls: <span data-testid="voice-calls-state" className={active ? "text-[#1e7b44]" : "text-[#8a5a00]"}>{settings.data ? (active ? "Active" : "Paused") : "…"}</span></div>
        {settings.data?.changed_by && (
          <div className="mt-1 text-xs text-[#77787b]" data-testid="voice-calls-changed">
            {active ? "Resumed" : "Paused"} by {settings.data.changed_by} at {when(settings.data.changed_at)}
          </div>
        )}
        {!isAdmin && <div className="mt-1 text-xs text-[#77787b]">Only an admin can change this.</div>}
        {error && <div className="mt-1 text-xs text-[#a32720]">{error}</div>}
      </div>
      {isAdmin && (
        <button type="button" onClick={toggle} disabled={change.isPending || !settings.data} className="inline-flex h-9 items-center gap-2 rounded-[4px] border border-[#0b0b0b] bg-[#0b0b0b] px-3 text-sm text-white disabled:opacity-60">
          {active ? <PauseCircle size={15} /> : <PlayCircle size={15} />} {active ? "Pause AI calls" : "Resume AI calls"}
        </button>
      )}
      {confirming && (
        <div role="dialog" aria-modal="true" aria-label="Resume AI driver calls" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-sm border border-[#0b0b0b] bg-white p-5">
            <div className="text-base font-semibold">Resume AI driver calls?</div>
            <p className="mt-2 text-sm text-[#55565a]">Drivers will start receiving AI calls on new assignments. Continue?</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="h-9 rounded-[4px] border border-[#d8d7d2] bg-white px-3 text-sm">Cancel</button>
              <button type="button" onClick={() => change.mutate("active")} disabled={change.isPending} className="h-9 rounded-[4px] border border-[#0b0b0b] bg-[#0b0b0b] px-3 text-sm text-white disabled:opacity-60">Continue</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
