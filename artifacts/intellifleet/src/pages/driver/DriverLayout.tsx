import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCircle2, ClipboardList, RefreshCw, Route as RouteIcon, User } from "lucide-react";
import { alreadyDoneText, withDriverParams } from "@/lib/driver";
import { subscribeResults, useOfflineQueue } from "@/lib/offlineRuntime";
import type { QueueEntry } from "@/lib/offlineQueue";
import { entryStatusLabel, syncBadge } from "@/lib/syncStatus";
import { useAlertsQuery } from "./queries";
import { Avatar, ToastHost, showToast } from "./shared";
import type { DriverScope } from "./shared";

const KIND_LABEL: Record<string, string> = {
  acknowledge: "Acknowledge",
  start: "Start trip",
  check_in: "Arrived at site",
  check_out: "Departed from site",
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
          <button type="button" onClick={onClose} className="min-h-[48px] px-2 text-sm font-semibold underline">
            Close
          </button>
        </div>
        {visible.length === 0 ? (
          <p className="py-2 text-sm text-[#55565a]">Everything is synced with the server.</p>
        ) : (
          <ul className="divide-y divide-[#efeeeb]">
            {visible.map((e) => (
              <li key={e.id} className="py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="break-words font-semibold">{entryLabel(e)}</div>
                    <div className={e.status === "needs_attention" ? "font-semibold text-[#86000B]" : "text-[#55565a]"}>{entryStatusLabel(e)}</div>
                    {e.error && <div className="mt-1 break-words text-[#86000B]">{e.error}</div>}
                  </div>
                  {e.status === "needs_attention" && (
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => void retry(e.id)} className="min-h-[48px] border border-black px-3 text-sm font-semibold">
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Discard this action? It was not accepted by the server and will be lost.")) void dismiss(e.id);
                        }}
                        className="min-h-[48px] border border-[#86000B] px-3 text-sm font-semibold text-[#86000B]"
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
        <button type="button" onClick={() => void syncNow()} className="mt-2 inline-flex min-h-[48px] items-center gap-2 border border-[#d8d7d2] px-4 text-sm font-semibold">
          <RefreshCw size={16} />
          Sync now
        </button>
      </div>
    </div>
  );
}

const PILL_TONE: Record<string, string> = {
  failed: "border-[#86000B] bg-[#fff1f2] text-[#86000B]",
  syncing: "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]",
  pending: "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]",
  saved_locally: "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]",
  synced: "border-[#33673B]/40 bg-[#f1f8f2] text-[#33673B]",
};

// Driver pages deliberately do not use AppShell (no 5-minute idle logout): drivers keep their long-lived session.
// Bottom nav: Today / Trips / Alerts / Profile. Logout lives in Profile.
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
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const queue = useOfflineQueue();
  const alerts = useAlertsQuery(scope);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // When a queued action is CONFIRMED by the server, refresh what the screens show and flash "Synced".
  useEffect(
    () =>
      subscribeResults((_entry, response) => {
        void queryClient.invalidateQueries({ queryKey: ["driver-assignment"] });
        void queryClient.invalidateQueries({ queryKey: ["driver-today"] });
        void queryClient.invalidateQueries({ queryKey: ["driver-route"] });
        void queryClient.invalidateQueries({ queryKey: ["driver-alerts"] });
        setConfirmedAt(Date.now());
        if (response.already_done) showToast(alreadyDoneText(response.done_by), "warn");
      }),
    [queryClient],
  );
  useEffect(() => {
    if (confirmedAt === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 4200);
    setNow(Date.now());
    return () => window.clearTimeout(timer);
  }, [confirmedAt]);

  const badge = syncBadge(queue.entries, confirmedAt, now);
  const unread = alerts.data?.unread ?? 0;
  const adminParam = { driver_id: scope.adminDriverId };
  const tab = location.startsWith("/driver/trips") || (typeof window !== "undefined" && window.location.search.includes("from=history")) ? "trips" : location.startsWith("/driver/alerts") ? "alerts" : location.startsWith("/driver/profile") || location.startsWith("/driver/issues") ? "profile" : "today";
  const navClass = (active: boolean) => `relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-black" : "text-[#77787b]"}`;
  const PillIcon = badge.kind === "failed" ? AlertTriangle : badge.kind === "synced" ? CheckCircle2 : RefreshCw;

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#f2f2ef] text-black">
      <header className="sticky top-0 z-20 flex min-h-[56px] items-center justify-between gap-2 border-b border-[#e4e3df] bg-white px-4 pt-[env(safe-area-inset-top)]">
        <Link href={withDriverParams("/driver/profile", adminParam)} className="flex min-h-[48px] min-w-0 items-center gap-2" aria-label="Profile">
          <Avatar name={name} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">{name ?? "Rare Logistics"}</span>
            {scope.isAdmin && <span className="block text-[10px] uppercase tracking-wide text-[#a16819]">Admin view (read only)</span>}
          </span>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          {badge.kind !== "idle" && (
            <button
              type="button"
              data-testid={badge.kind === "failed" ? "driver-needs-attention" : "driver-pending-sync"}
              data-sync={badge.kind}
              onClick={() => setPanelOpen((o) => !o)}
              className={`inline-flex min-h-[48px] items-center gap-1 border px-3 text-xs font-bold ${PILL_TONE[badge.kind]}`}
            >
              <PillIcon size={14} className={badge.kind === "syncing" ? "animate-spin" : ""} />
              {badge.text}
            </button>
          )}
          {!scope.isAdmin && (
            <Link href="/driver/alerts" data-testid="driver-bell" aria-label={unread > 0 ? `${unread} unread alerts` : "Alerts"} className="relative inline-flex h-12 w-12 items-center justify-center">
              <Bell size={22} />
              {unread > 0 && (
                <span data-testid="driver-unread" className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#86000B] px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </Link>
          )}
        </div>
      </header>
      {panelOpen && <SyncPanel onClose={() => setPanelOpen(false)} />}
      <main className={`mx-auto w-full max-w-[640px] px-4 pt-5 ${fullScreen ? "pb-40" : "pb-28"}`}>{children}</main>
      <ToastHost />
      {!fullScreen && (
        <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-[#e4e3df] bg-white pb-[env(safe-area-inset-bottom)]" aria-label="Driver navigation">
          <Link href={withDriverParams("/driver/today", adminParam)} data-testid="driver-nav-today" aria-current={tab === "today" ? "page" : undefined} className={navClass(tab === "today")}>
            <ClipboardList size={22} />
            Today
          </Link>
          <Link href={withDriverParams("/driver/trips", adminParam)} data-testid="driver-nav-trips" aria-current={tab === "trips" ? "page" : undefined} className={navClass(tab === "trips")}>
            <RouteIcon size={22} />
            Trips
          </Link>
          {!scope.isAdmin && (
            <Link href="/driver/alerts" data-testid="driver-nav-alerts" aria-current={tab === "alerts" ? "page" : undefined} className={navClass(tab === "alerts")}>
              <span className="relative">
                <Bell size={22} />
                {unread > 0 && <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-[#86000B]" />}
              </span>
              Alerts
            </Link>
          )}
          <Link href={withDriverParams("/driver/profile", adminParam)} data-testid="driver-nav-profile" aria-current={tab === "profile" ? "page" : undefined} className={navClass(tab === "profile")}>
            <User size={22} />
            Profile
          </Link>
        </nav>
      )}
    </div>
  );
}
