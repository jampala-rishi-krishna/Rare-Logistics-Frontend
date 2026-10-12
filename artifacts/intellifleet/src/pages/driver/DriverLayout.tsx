import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ClipboardList, LogOut, RefreshCw } from "lucide-react";
import { clearStoredSessionId } from "@/services/api/client";
import { alreadyDoneText, withDriverParams } from "@/lib/driver";
import { subscribeResults, useOfflineQueue } from "@/lib/offlineRuntime";
import type { QueueEntry } from "@/lib/offlineQueue";
import { ToastHost, showToast } from "./shared";
import type { DriverScope } from "./shared";

const KIND_LABEL: Record<string, string> = {
  acknowledge: "Acknowledge",
  start: "Start trip",
  check_in: "Arrived",
  check_out: "Check out",
  end: "End trip",
  handover: "Hand over invoices",
};

function entryLabel(e: QueueEntry): string {
  return e.label || KIND_LABEL[e.kind] || e.kind;
}

function SyncPanel({ onClose }: { onClose: () => void }) {
  const { entries, retry, dismiss, syncNow } = useOfflineQueue();
  const visible = entries.filter((e) => e.status !== "done");
  return (
    <div className="border-b border-[#e4e3df] bg-white px-4 py-3" data-testid="driver-sync-panel">
      <div className="mx-auto max-w-[640px]">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-bold">Saved on this phone</div>
          <button type="button" onClick={onClose} className="min-h-[44px] px-2 text-sm font-semibold underline">
            Close
          </button>
        </div>
        {visible.length === 0 ? (
          <p className="py-2 text-sm text-[#55565a]">Everything is synced.</p>
        ) : (
          <ul className="divide-y divide-[#efeeeb]">
            {visible.map((e) => (
              <li key={e.id} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words font-semibold">{entryLabel(e)}</div>
                    <div className={e.status === "needs_attention" ? "font-semibold text-[#86000B]" : "text-[#55565a]"}>
                      {e.status === "needs_attention" ? "Needs attention" : e.status === "syncing" ? "Syncing..." : "Waiting to sync"}
                    </div>
                    {e.error && <div className="mt-1 break-words text-[#86000B]">{e.error}</div>}
                  </div>
                  {e.status === "needs_attention" && (
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => void retry(e.id)} className="min-h-[44px] border border-black px-3 text-sm font-semibold">
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Discard this action? It was not accepted by the server and will be lost.")) void dismiss(e.id);
                        }}
                        className="min-h-[44px] border border-[#86000B] px-3 text-sm font-semibold text-[#86000B]"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" onClick={() => void syncNow()} className="mt-2 inline-flex min-h-[44px] items-center gap-2 border border-[#d8d7d2] px-4 text-sm font-semibold">
          <RefreshCw size={16} />
          Sync now
        </button>
      </div>
    </div>
  );
}

// Driver pages deliberately do not use AppShell (no 5-minute idle logout): drivers keep their
// long-lived session and get a light header plus a two-item bottom nav.
export default function DriverLayout({
  scope,
  name,
  children,
  fullScreen = false,
}: {
  scope: DriverScope;
  name: string | null;
  children: ReactNode;
  // Full-screen forms hide the bottom nav so the submit bar owns the bottom of the screen.
  fullScreen?: boolean;
}) {
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { pending, needsAttention } = useOfflineQueue();
  const [panelOpen, setPanelOpen] = useState(false);

  // When a queued action syncs, refresh what the screens show and surface "already done" results.
  useEffect(
    () =>
      subscribeResults((_entry, response) => {
        void queryClient.invalidateQueries({ queryKey: ["driver-assignment"] });
        void queryClient.invalidateQueries({ queryKey: ["driver-today"] });
        void queryClient.invalidateQueries({ queryKey: ["driver-route"] });
        if (response.already_done) showToast(alreadyDoneText(response.done_by), "warn");
      }),
    [queryClient],
  );

  const logout = () => {
    if (pending + needsAttention > 0 && !window.confirm(`${pending + needsAttention} action(s) are still saved on this phone and not synced. Log out anyway?`)) return;
    clearStoredSessionId();
    setLocation("/login");
  };
  const adminParam = { driver_id: scope.adminDriverId };
  const todayHref = withDriverParams("/driver/today", adminParam);
  const historyHref = withDriverParams("/driver/history", adminParam);
  const onHistory = location.startsWith("/driver/history");
  const navClass = (active: boolean) =>
    `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-xs font-semibold ${active ? "text-black" : "text-[#77787b]"}`;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#f2f2ef] text-black">
      <header className="sticky top-0 z-20 flex min-h-[56px] items-center justify-between gap-2 border-b border-[#e4e3df] bg-white px-4">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{name ?? "IntelliFleet"}</div>
          {scope.isAdmin && <div className="text-[10px] uppercase tracking-wide text-[#a16819]">Admin view (read only)</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {needsAttention > 0 && (
            <button
              type="button"
              data-testid="driver-needs-attention"
              onClick={() => setPanelOpen((o) => !o)}
              className="inline-flex min-h-[44px] items-center gap-1 border border-[#86000B] bg-[#fff1f2] px-3 text-xs font-bold text-[#86000B]"
            >
              <AlertTriangle size={14} />
              Needs attention ({needsAttention})
            </button>
          )}
          {pending > 0 && (
            <button
              type="button"
              data-testid="driver-pending-sync"
              onClick={() => setPanelOpen((o) => !o)}
              className="inline-flex min-h-[44px] items-center gap-1 border border-[#e6c36a] bg-[#fff6dd] px-3 text-xs font-bold text-[#6b4a00]"
            >
              <RefreshCw size={14} />
              Pending sync ({pending})
            </button>
          )}
          <button
            type="button"
            onClick={logout}
            data-testid="driver-logout"
            aria-label="Log out"
            className="inline-flex min-h-[44px] shrink-0 items-center gap-2 border border-[#d8d7d2] bg-white px-3 text-sm font-semibold"
          >
            <LogOut size={16} />
            <span className="hidden min-[400px]:inline">Log out</span>
          </button>
        </div>
      </header>
      {panelOpen && <SyncPanel onClose={() => setPanelOpen(false)} />}
      <main className={`mx-auto w-full max-w-[640px] px-4 pt-5 ${fullScreen ? "pb-32" : "pb-28"}`}>{children}</main>
      <ToastHost />
      {!fullScreen && (
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-[#e4e3df] bg-white pb-[env(safe-area-inset-bottom)]">
          <Link href={todayHref} data-testid="driver-nav-today" className={navClass(!onHistory)}>
            <ClipboardList size={20} />
            Today
          </Link>
          <Link href={historyHref} data-testid="driver-nav-history" className={navClass(onHistory)}>
            <CalendarClock size={20} />
            History
          </Link>
        </nav>
      )}
    </div>
  );
}
