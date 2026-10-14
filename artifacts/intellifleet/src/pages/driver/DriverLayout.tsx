import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatClock } from "@/lib/driver";
import { subscribeDropped, subscribeResults, useOfflineQueue } from "@/lib/offlineRuntime";
import type { QueueEntry } from "@/lib/offlineQueue";
import { syncBadge } from "@/lib/syncStatus";
import { DICTS, getLang, useT } from "./i18n";
import { useToday } from "./queries";
import { ordersToAcknowledge } from "@/lib/tripNav";
import { ToastHost, showToast } from "./shared";
import type { DriverScope } from "./shared";
import { BottomNav, C, Icon, OutlineButton, Page, PrimaryButton, Sheet, SheetTitle, TextButton } from "./ui";
import type { Tab } from "./ui";

const KIND_LABEL: Record<string, string> = {
  acknowledge: "Acknowledge",
  acknowledge_all: "Acknowledge all",
  start: "Start trip",
  check_in: "Reached",
  check_out: "Delivered",
  end: "End trip",
  handover: "Hand over invoices",
};

function entryLabel(e: QueueEntry): string {
  return e.label || KIND_LABEL[e.kind] || e.kind;
}

function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { entries, retry, dismiss, syncNow } = useOfflineQueue();
  const visible = entries.filter((e) => e.status !== "done");
  return (
    <Sheet open={open} onClose={onClose} testId="driver-sync-panel">
      <SheetTitle>{t.savedOnPhone}</SheetTitle>
      {visible.length === 0 ? (
        <div style={{ fontSize: 15, color: C.sub }}>{t.allSent}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((e) => (
            <div key={e.id} style={{ background: C.soft, borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, overflowWrap: "anywhere" }}>{entryLabel(e)}</div>
              <div style={{ fontSize: 13, color: e.status === "needs_attention" ? C.so : C.sub, fontWeight: 500 }}>
                {e.status === "needs_attention" ? t.notSent : e.status === "syncing" ? t.syncing : t.waitingToSend}
              </div>
              {e.error && <div style={{ fontSize: 13, color: C.so, marginTop: 4, overflowWrap: "anywhere" }}>{e.error}</div>}
              {e.status === "needs_attention" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                  <OutlineButton height={48} fontSize={15} onClick={() => void retry(e.id)}>
                    {t.retry}
                  </OutlineButton>
                  <OutlineButton
                    height={48}
                    fontSize={15}
                    onClick={() => {
                      if (window.confirm(t.discardQ)) void dismiss(e.id);
                    }}
                  >
                    {t.dismiss}
                  </OutlineButton>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <PrimaryButton height={56} fontSize={17} icon="refresh" onClick={() => void syncNow()}>
        {t.sendNow}
      </PrimaryButton>
      <TextButton onClick={onClose}>{t.close}</TextButton>
    </Sheet>
  );
}

// Small status row: only visible when something is waiting on this phone or was just sent.
function SyncRow({ onOpen, confirmedAt }: { onOpen: () => void; confirmedAt: number | null }) {
  const t = useT();
  const queue = useOfflineQueue();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (confirmedAt === null) return;
    setNow(Date.now());
    const timer = window.setTimeout(() => setNow(Date.now()), 4200);
    return () => window.clearTimeout(timer);
  }, [confirmedAt]);
  const badge = syncBadge(queue.entries, confirmedAt, now);
  if (badge.kind === "idle") return null;
  const failed = badge.kind === "failed";
  const ok = badge.kind === "synced";
  const text = failed ? t.syncFailed(badge.count) : ok ? t.synced : badge.kind === "syncing" ? t.syncing : t.syncPending(badge.count);
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={failed ? "driver-needs-attention" : "driver-pending-sync"}
      data-sync={badge.kind}
      style={{ margin: "10px 20px 0", minHeight: 44, padding: "8px 14px", borderRadius: 14, border: 0, background: failed ? "#FDECEC" : ok ? C.greenBg : C.amberBg, color: failed ? C.so : ok ? C.green : C.amber, fontFamily: "inherit", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 10, textAlign: "left", cursor: "pointer" }}
    >
      <Icon name={ok ? "check" : "refresh"} size={18} color={failed ? C.so : ok ? C.green : C.amber} />
      {text}
    </button>
  );
}

// Driver pages deliberately do not use AppShell (no idle logout): drivers keep their long-lived session.
// Tabs (Today / History / Profile) get the bottom nav; the trip screen passes no tab and owns the bottom with its own bar.
export default function DriverLayout({ scope, tab, children, testId }: { scope: DriverScope; tab?: Tab; children: ReactNode; testId?: string }) {
  const queryClient = useQueryClient();
  const today = useToday(scope);
  const queue = useOfflineQueue();
  const ackBadge = ordersToAcknowledge(today.data?.data.batches, queue.entries);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<number | null>(null);

  // A queued action CONFIRMED by the server: refresh what the screens show and flash "Sent".
  useEffect(
    () =>
      subscribeResults((_entry, response) => {
        void queryClient.invalidateQueries({ queryKey: ["driver-assignment"] });
        void queryClient.invalidateQueries({ queryKey: ["driver-today"] });
        void queryClient.invalidateQueries({ queryKey: ["driver-alerts"] });
        setConfirmedAt(Date.now());
        const t = DICTS[getLang()];
        if (response.already_done) showToast(t.alreadyDone(response.done_by?.name ?? "", formatClock(response.done_by?.at)), "warn");
      }),
    [queryClient],
  );
  // A queued action whose order / trip dispatch removed: dropped for good, and the crew is told.
  useEffect(
    () =>
      subscribeDropped((_entry, info) => {
        const t = DICTS[getLang()];
        showToast(info.code === "trip_removed" ? t.removedTrip : t.orderRemovedByDispatch, "error");
        void queryClient.invalidateQueries({ queryKey: ["driver-assignment"] });
        void queryClient.invalidateQueries({ queryKey: ["driver-today"] });
      }),
    [queryClient],
  );

  return (
    <Page testId={testId}>
      <SyncRow onOpen={() => setPanelOpen(true)} confirmedAt={confirmedAt} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</div>
      {tab && <BottomNav active={tab} adminDriverId={scope.adminDriverId} badge={ackBadge} />}
      <SyncSheet open={panelOpen} onClose={() => setPanelOpen(false)} />
      <ToastHost />
    </Page>
  );
}
