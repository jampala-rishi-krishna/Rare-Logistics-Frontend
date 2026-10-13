import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Lock, LogOut, MessageSquare, Phone } from "lucide-react";
import * as authApi from "@/services/api/auth";
import { clearStoredSessionId } from "@/services/api/client";
import { telHref } from "@/lib/driver";
import { validateNewPassword } from "@/lib/driver";
import { useOfflineQueue } from "@/lib/offlineRuntime";
import DriverLayout from "./DriverLayout";
import { Avatar, ErrorState, MissingDriverNotice, Skeleton, errorText, useDriverMe, useDriverScope } from "./shared";

function InfoRow({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-[#efeeeb] px-4 py-2 last:border-b-0" data-testid={testId}>
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[#77787b]">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-semibold">{children}</span>
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = "min-h-[48px] w-full border border-[#d8d7d2] bg-white px-3 text-base";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const problem = validateNewPassword(next, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      setDone(true); // shown only after the server accepted the change
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-[#efeeeb]">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} data-testid="driver-change-password" className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm font-semibold">
        <Lock size={18} className="text-[#55565a]" />
        <span className="flex-1">Change password</span>
        <ChevronRight size={18} className={`text-[#77787b] transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <form onSubmit={submit} className="grid gap-3 px-4 pb-4">
          <input type="password" autoComplete="current-password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
          <input type="password" autoComplete="new-password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
          <input type="password" autoComplete="new-password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
          {error && (
            <p role="alert" className="text-sm font-semibold text-[#86000B]">
              {error}
            </p>
          )}
          {done && (
            <p role="status" data-testid="driver-password-changed" className="text-sm font-semibold text-[#33673B]">
              Password changed.
            </p>
          )}
          <button type="submit" disabled={busy || !current} className="min-h-[52px] bg-black text-sm font-bold !text-white disabled:opacity-40">
            {busy ? "Saving..." : "Save new password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default function DriverProfile() {
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const queue = useOfflineQueue();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const data = me.data;
  const dispatchTel = telHref(data?.dispatch_phone);

  const logout = async () => {
    const waiting = queue.entries.filter((e) => e.status !== "done").length;
    if (waiting > 0 && !window.confirm(`${waiting} action(s) are still saved on this phone and not synced. Log out anyway?`)) return;
    try {
      await authApi.logout();
    } catch {
      // The local session must still be cleared when offline.
    }
    clearStoredSessionId();
    queryClient.clear();
    setLocation("/driver/login");
  };

  return (
    <DriverLayout scope={scope} name={data?.name ?? null}>
      {scope.missingDriverId ? (
        <MissingDriverNotice />
      ) : me.isLoading ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : me.isError && !data ? (
        <ErrorState message={errorText(me.error)} onRetry={() => void me.refetch()} />
      ) : data ? (
        <div className="grid gap-4">
          <section className="flex items-center gap-4 border border-[#e4e3df] bg-white p-4" data-testid="driver-profile-header">
            <Avatar name={data.name} size={64} />
            <div className="min-w-0">
              <h1 className="break-words text-xl font-bold leading-tight">{data.name}</h1>
              <div className="text-sm capitalize text-[#55565a]">
                {data.role ?? "driver"}
                {data.staff_id !== undefined ? ` · Staff ID ${data.staff_id}` : ""}
              </div>
            </div>
          </section>

          <section className="border border-[#e4e3df] bg-white" aria-label="Personal information">
            <InfoRow label="Phone" testId="profile-phone">
              {data.phone ?? "—"}
            </InfoRow>
            <InfoRow label="Email" testId="profile-email">
              {data.email ?? "—"}
            </InfoRow>
            <InfoRow label="Warehouse" testId="profile-warehouse">
              {data.warehouse ?? "—"}
            </InfoRow>
            <InfoRow label="Vehicle today" testId="profile-vehicle">
              {data.vehicles_today && data.vehicles_today.length > 0 ? data.vehicles_today.join(", ") : "None assigned"}
            </InfoRow>
            <InfoRow label="Crew today" testId="profile-crew">
              {data.crew_today && data.crew_today.length > 0 ? data.crew_today.map((p) => `${p.name} (${p.role})`).join(", ") : "—"}
            </InfoRow>
          </section>

          {!scope.isAdmin && (
            <section className="border border-[#e4e3df] bg-white" aria-label="Help">
              {dispatchTel ? (
                <a href={dispatchTel} data-testid="profile-call-dispatch" className="flex min-h-[52px] items-center gap-3 border-b border-[#efeeeb] px-4 text-sm font-semibold">
                  <Phone size={18} className="text-[#55565a]" />
                  <span className="flex-1">Contact dispatcher</span>
                  <span className="text-xs font-normal text-[#77787b]">{data.dispatch_phone}</span>
                </a>
              ) : (
                <div className="flex min-h-[52px] items-center gap-3 border-b border-[#efeeeb] px-4 text-sm text-[#77787b]" data-testid="profile-no-dispatch">
                  <Phone size={18} />
                  Dispatcher number not set up yet
                </div>
              )}
              <Link href="/driver/issues/new" data-testid="profile-report-issue" className="flex min-h-[52px] items-center gap-3 border-b border-[#efeeeb] px-4 text-sm font-semibold">
                <AlertTriangle size={18} className="text-[#55565a]" />
                <span className="flex-1">Report an issue</span>
                <ChevronRight size={18} className="text-[#77787b]" />
              </Link>
              <Link href="/driver/issues" data-testid="profile-my-issues" className="flex min-h-[52px] items-center gap-3 border-b border-[#efeeeb] px-4 text-sm font-semibold">
                <MessageSquare size={18} className="text-[#55565a]" />
                <span className="flex-1">My reported issues</span>
                <ChevronRight size={18} className="text-[#77787b]" />
              </Link>
              <ChangePassword />
              <button type="button" onClick={() => void logout()} data-testid="driver-logout" className="flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-sm font-semibold text-[#86000B]">
                <LogOut size={18} />
                Log out
              </button>
            </section>
          )}
        </div>
      ) : null}
    </DriverLayout>
  );
}
