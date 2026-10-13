import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardList, MessageSquare, RefreshCw, ShieldAlert } from "lucide-react";
import * as driverApi from "@/services/api/driver";
import { timeAgo } from "@/lib/overview";
import { useOfflineQueue } from "@/lib/offlineRuntime";
import { alertTabs } from "@/lib/alerts";
import type { AlertTab } from "@/lib/alerts";
import type { AlertItem } from "@/lib/tripTypes";
import DriverLayout from "./DriverLayout";
import { useAlertsQuery } from "./queries";
import { ErrorState, Skeleton, errorText, useDriverMe, useDriverScope } from "./shared";

const ICONS: Record<string, typeof ClipboardList> = { assigned: ClipboardList, changed: RefreshCw, validated: CheckCircle2, issue: MessageSquare };

function AlertRow({ alert, onOpen }: { alert: AlertItem; onOpen: (a: AlertItem) => void }) {
  const Icon = ICONS[alert.type] ?? ShieldAlert;
  return (
    <li>
      <button type="button" onClick={() => onOpen(alert)} data-testid={`driver-alert-${alert.type}`} data-read={alert.read ? "true" : "false"} className="flex w-full min-h-[64px] items-start gap-3 border-b border-[#efeeeb] bg-white px-4 py-3 text-left">
        <span className="mt-0.5 shrink-0 text-[#55565a]">
          <Icon size={22} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className={`text-sm ${alert.read ? "font-semibold" : "font-bold"}`}>{alert.title}</span>
            <span className="shrink-0 text-[11px] text-[#77787b]">{timeAgo(alert.at)}</span>
          </span>
          <span className="mt-0.5 block break-words text-sm text-[#55565a]">{alert.body}</span>
        </span>
        {!alert.read && <span aria-label="Unread" className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#86000B]" />}
      </button>
    </li>
  );
}

export default function DriverAlerts() {
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const queue = useOfflineQueue();
  const alerts = useAlertsQuery(scope);
  const [tab, setTab] = useState<AlertTab>("all");

  const markRead = useMutation({
    mutationFn: (input: { keys?: string[]; all?: boolean }) => driverApi.markAlertsRead(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["driver-alerts"] }),
  });

  const list = alerts.data?.alerts ?? [];
  const tabs = alertTabs(list);
  const shown = tabs[tab];
  // "Sync failed" is a real event of THIS phone: actions the server did not accept.
  const failed = queue.entries.filter((e) => e.status === "needs_attention");

  const open = (alert: AlertItem) => {
    if (!alert.read) markRead.mutate({ keys: [alert.key] });
    setLocation(alert.link);
  };
  const tabClass = (active: boolean) => `min-h-[48px] flex-1 border-b-2 px-2 text-sm font-semibold ${active ? "border-black text-black" : "border-transparent text-[#77787b]"}`;

  return (
    <DriverLayout scope={scope} name={me.data?.name ?? null}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight">Alerts</h1>
        {(alerts.data?.unread ?? 0) > 0 && (
          <button type="button" disabled={markRead.isPending} onClick={() => markRead.mutate({ all: true })} data-testid="driver-alerts-mark-all" className="min-h-[48px] px-2 text-sm font-semibold underline">
            Mark all read
          </button>
        )}
      </div>

      {scope.isAdmin ? (
        <p className="mt-4 border border-[#e4e3df] bg-white p-4 text-sm text-[#55565a]">Alerts belong to the driver or helper who is signed in.</p>
      ) : (
        <>
          {failed.length > 0 && (
            <section className="mt-4 border border-[#86000B] bg-[#fff1f2] p-4" data-testid="driver-alert-sync-failed" aria-label="Sync failed">
              <div className="flex items-center gap-2 text-sm font-bold text-[#86000B]">
                <AlertTriangle size={18} />
                Sync failed ({failed.length})
              </div>
              <ul className="mt-2 grid gap-2 text-sm">
                {failed.map((e) => (
                  <li key={e.id} className="break-words">
                    <span className="font-semibold">{e.label ?? e.kind}</span>
                    {e.error ? ` - ${e.error}` : ""}
                    <div className="mt-1 flex gap-2">
                      <button type="button" onClick={() => void queue.retry(e.id)} className="min-h-[48px] flex-1 border border-black bg-white text-sm font-semibold">
                        Retry
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Discard this action? It was not accepted by the server and will be lost.")) void queue.dismiss(e.id);
                        }}
                        className="min-h-[48px] flex-1 border border-[#86000B] bg-white text-sm font-semibold text-[#86000B]"
                      >
                        Dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div role="tablist" aria-label="Alert filter" className="mt-4 flex border-b border-[#e4e3df]">
            <button type="button" role="tab" aria-selected={tab === "all"} onClick={() => setTab("all")} data-testid="driver-alerts-tab-all" className={tabClass(tab === "all")}>
              All
            </button>
            <button type="button" role="tab" aria-selected={tab === "unread"} onClick={() => setTab("unread")} data-testid="driver-alerts-tab-unread" className={tabClass(tab === "unread")}>
              Unread ({tabs.unread.length})
            </button>
            <button type="button" role="tab" aria-selected={tab === "important"} onClick={() => setTab("important")} data-testid="driver-alerts-tab-important" className={tabClass(tab === "important")}>
              Important
            </button>
          </div>

          <div className="mt-3 border border-[#e4e3df] bg-white">
            {alerts.isLoading ? (
              <div className="grid gap-2 p-4" aria-busy="true">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : alerts.isError && list.length === 0 ? (
              <div className="p-3">
                <ErrorState message={errorText(alerts.error)} onRetry={() => void alerts.refetch()} />
              </div>
            ) : shown.length === 0 ? (
              <p data-testid="driver-alerts-empty" className="p-6 text-center text-sm font-semibold">
                {tab === "unread" ? "You are all caught up." : tab === "important" ? "No important alerts." : "No alerts yet. New assignments and replies from dispatch show up here."}
              </p>
            ) : (
              <ul data-testid="driver-alerts-list">
                {shown.map((a) => (
                  <AlertRow key={a.key} alert={a} onOpen={open} />
                ))}
              </ul>
            )}
          </div>
          {markRead.isError && <p className="mt-2 text-xs text-[#86000B]">Could not mark as read. Check your connection.</p>}
        </>
      )}
    </DriverLayout>
  );
}
