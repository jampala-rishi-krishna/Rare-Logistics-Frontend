// Alerts page (opened from the bell on Today). Same data as before: GET /api/driver/alerts + POST /alerts/read.
// New-assignment / acknowledge-needed alerts open the Acknowledge tab; others follow their own link.
import { useLocation } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as driverApi from "@/services/api/driver";
import { formatDateTimeShort, withDriverParams } from "@/lib/driver";
import { alertTarget } from "@/lib/tripNav";
import DriverLayout from "./DriverLayout";
import { useT } from "./i18n";
import { useAlertsQuery } from "./queries";
import { ErrorState, errorText, useDriverScope } from "./shared";
import { C, RoundButton, Skeleton } from "./ui";

export default function DriverAlerts() {
  const t = useT();
  const scope = useDriverScope();
  const alerts = useAlertsQuery(scope);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: (input: { keys?: string[]; all?: boolean }) => driverApi.markAlertsRead(input),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["driver-alerts"] }),
  });
  const list = alerts.data?.alerts ?? [];
  const unread = alerts.data?.unread ?? list.filter((a) => !a.read).length;

  return (
    <DriverLayout scope={scope} testId="driver-alerts-page">
      <div style={{ background: C.card, padding: "16px 20px 18px", borderBottom: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <RoundButton icon="back" label={t.backToToday} href={withDriverParams("/driver/today", { driver_id: scope.adminDriverId })} filled testId="driver-alerts-back" />
          {unread > 0 && !scope.isAdmin && (
            <button type="button" data-testid="driver-alerts-read-all" onClick={() => markRead.mutate({ all: true })} style={{ minHeight: 44, padding: "0 14px", borderRadius: 22, border: `1px solid ${C.field}`, background: "#FFFFFF", fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: C.ink, cursor: "pointer" }}>
              {t.markAllRead}
            </button>
          )}
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 12 }}>{t.alertsTitle}</div>
      </div>
      <div data-testid="driver-alerts" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 20px 24px" }}>
        {alerts.isLoading ? (
          <>
            <Skeleton height={72} />
            <Skeleton height={72} />
          </>
        ) : alerts.isError && !alerts.data ? (
          <ErrorState message={errorText(alerts.error)} onRetry={() => void alerts.refetch()} />
        ) : list.length === 0 ? (
          <div data-testid="driver-alerts-empty" style={{ background: C.card, borderRadius: 18, padding: 20, textAlign: "center", fontSize: 15, fontWeight: 700 }}>
            {t.noAlerts}
          </div>
        ) : (
          list.map((a) => (
            <button
              key={a.key}
              type="button"
              data-testid={`driver-alert-${a.type}`}
              data-read={a.read ? "true" : "false"}
              onClick={() => {
                if (!a.read) markRead.mutate({ keys: [a.key] });
                setLocation(alertTarget(a, scope.adminDriverId));
              }}
              style={{ display: "flex", width: "100%", gap: 12, alignItems: "flex-start", padding: 16, border: 0, borderRadius: 18, background: C.card, fontFamily: "inherit", color: C.ink, textAlign: "left", cursor: "pointer" }}
            >
              <span aria-label={a.read ? undefined : "Unread"} style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, background: a.read ? C.muted : C.so, flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontSize: 16, fontWeight: a.read ? 500 : 700, overflowWrap: "anywhere" }}>{a.title}</span>
                {a.body && <span style={{ display: "block", fontSize: 14, color: C.sub, marginTop: 2, overflowWrap: "anywhere" }}>{a.body}</span>}
                {a.at && <span style={{ display: "block", fontSize: 12, color: C.sub, marginTop: 4 }}>{formatDateTimeShort(a.at)}</span>}
              </span>
            </button>
          ))
        )}
      </div>
    </DriverLayout>
  );
}
