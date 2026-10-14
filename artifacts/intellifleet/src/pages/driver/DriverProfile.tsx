import { useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import * as authApi from "@/services/api/auth";
import { clearStoredSessionId } from "@/services/api/client";
import { MIN_PASSWORD_LENGTH, telHref } from "@/lib/driver";
import { useOfflineQueue } from "@/lib/offlineRuntime";
import DriverLayout from "./DriverLayout";
import { useLang, useT } from "./i18n";
import { ErrorState, MissingDriverNotice, errorText, useDriverMe, useDriverScope } from "./shared";
import { fieldInput } from "./fields";
import { Avatar, C, FieldError, Icon, PrimaryButton, Sheet, SheetTitle, Skeleton, TextButton } from "./ui";

function Row({ label, children, last = false, testId }: { label: string; children: ReactNode; last?: boolean; testId?: string }) {
  return (
    <div data-testid={testId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 16, borderBottom: last ? 0 : `1px solid ${C.muted}` }}>
      <span style={{ color: C.sub, flexShrink: 0 }}>{label}</span>
      <b style={{ textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{children}</b>
    </div>
  );
}

function PasswordSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    if (next.length < MIN_PASSWORD_LENGTH) return setError(t.pwShort);
    if (next !== confirm) return setError(t.pwMismatch);
    setError("");
    setBusy(true);
    try {
      await authApi.changePassword(current, next);
      setDone(true); // only after the server accepted it
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
    <Sheet open={open} onClose={onClose} busy={busy} testId="driver-password-sheet">
      <SheetTitle>{t.changePassword}</SheetTitle>
      <input type="password" autoComplete="current-password" placeholder={t.currentPassword} value={current} onChange={(e) => setCurrent(e.target.value)} style={fieldInput} />
      <input type="password" autoComplete="new-password" placeholder={t.newPassword} value={next} onChange={(e) => setNext(e.target.value)} style={fieldInput} />
      <input type="password" autoComplete="new-password" placeholder={t.confirmPassword} value={confirm} onChange={(e) => setConfirm(e.target.value)} style={fieldInput} />
      <FieldError>{error}</FieldError>
      {done && (
        <div role="status" data-testid="driver-password-changed" style={{ fontSize: 15, fontWeight: 700, color: C.green }}>
          {t.passwordChanged}
        </div>
      )}
      <PrimaryButton height={56} fontSize={17} disabled={busy || !current} onClick={() => void submit()}>
        {busy ? t.saving : t.savePassword}
      </PrimaryButton>
      <TextButton onClick={onClose}>{t.close}</TextButton>
    </Sheet>
  );
}

export default function DriverProfile() {
  const t = useT();
  const [lang, setLang] = useLang();
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const queue = useOfflineQueue();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [pwOpen, setPwOpen] = useState(false);
  const data = me.data;
  const dispatchTel = telHref(data?.dispatch_phone);
  const isHelper = (data?.role ?? "driver") === "helper";
  const partners = (data?.crew_today ?? []).filter((p) => String(p.id) !== String(data?.staff_id ?? data?.driver_id) && (isHelper ? p.role === "driver" : p.role !== "driver"));

  const logout = async () => {
    const waiting = queue.entries.filter((e) => e.status !== "done").length;
    if (waiting > 0 && !window.confirm(t.logoutUnsynced(waiting))) return;
    try {
      await authApi.logout();
    } catch {
      // The local session must still be cleared when offline.
    }
    clearStoredSessionId();
    queryClient.clear();
    setLocation("/driver/login");
  };

  const langBtn = (value: "en" | "tl", label: string) => (
    <button
      type="button"
      aria-pressed={lang === value}
      data-testid={`driver-lang-${value}`}
      onClick={() => setLang(value)}
      style={{ height: 40, padding: "0 16px", borderRadius: 20, border: 0, background: lang === value ? C.ink : "transparent", color: lang === value ? "#FFFFFF" : C.ink, fontFamily: "inherit", fontWeight: lang === value ? 700 : 500, cursor: "pointer" }}
    >
      {label}
    </button>
  );

  return (
    <DriverLayout scope={scope} tab="profile" testId="driver-profile">
      {scope.missingDriverId ? (
        <div style={{ padding: 20 }}>
          <MissingDriverNotice />
        </div>
      ) : me.isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }} aria-busy="true">
          <Skeleton height={64} />
          <Skeleton height={170} />
        </div>
      ) : me.isError && !data ? (
        <div style={{ padding: 20 }}>
          <ErrorState message={errorText(me.error)} onRetry={() => void me.refetch()} />
        </div>
      ) : data ? (
        <>
          <div data-testid="driver-profile-header" style={{ padding: "28px 20px 18px", display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar name={data.name} size={64} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", overflowWrap: "anywhere" }}>{data.name}</div>
              <div style={{ fontSize: 15, color: C.sub }} data-testid="profile-warehouse">
                {t.role(data.role ?? "driver")}
                {data.warehouse ? ` · ${data.warehouse}` : ""}
              </div>
            </div>
          </div>
          <div style={{ margin: "0 20px", background: C.card, borderRadius: 18, overflow: "hidden" }}>
            <Row label={t.phone} testId="profile-phone">
              {data.phone ?? "—"}
            </Row>
            <Row label={t.truckToday} testId="profile-vehicle">
              {data.vehicles_today && data.vehicles_today.length > 0 ? data.vehicles_today.join(", ") : t.none}
            </Row>
            <Row label={isHelper ? t.driverToday : t.helperToday} last testId="profile-crew">
              {partners.length > 0 ? partners.map((p) => p.name).join(", ") : t.none}
            </Row>
          </div>
          <div style={{ margin: "14px 20px 0", background: C.card, borderRadius: 18, padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>{t.language}</span>
            <div style={{ display: "flex", background: C.bg, borderRadius: 22, padding: 4 }}>
              {langBtn("en", t.english)}
              {langBtn("tl", t.tagalog)}
            </div>
          </div>
          {!scope.isAdmin && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "14px 20px 0" }}>
              {dispatchTel ? (
                <a href={dispatchTel} data-testid="profile-call-dispatch" style={{ height: 56, borderRadius: 16, background: C.ink, color: "#FFFFFF", fontSize: 17, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <Icon name="phone" size={20} color="#FFFFFF" />
                  {t.callDispatch}
                </a>
              ) : (
                <div data-testid="profile-no-dispatch" style={{ padding: "12px 14px", borderRadius: 14, background: C.amberBg, color: C.amber, fontSize: 14 }}>
                  {t.noDispatchNumber}
                </div>
              )}
              <button type="button" data-testid="driver-change-password" onClick={() => setPwOpen(true)} style={{ height: 56, borderRadius: 16, border: `1px solid ${C.field}`, background: "#FFFFFF", color: C.ink, fontFamily: "inherit", fontSize: 16, fontWeight: 500, cursor: "pointer" }}>
                {t.changePassword}
              </button>
              <button type="button" data-testid="driver-logout" onClick={() => void logout()} style={{ height: 56, borderRadius: 16, border: `1px solid ${C.field}`, background: "#FFFFFF", color: C.so, fontFamily: "inherit", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
                {t.logOut}
              </button>
            </div>
          )}
          <div style={{ height: 20 }} />
          <PasswordSheet open={pwOpen} onClose={() => setPwOpen(false)} />
        </>
      ) : null}
    </DriverLayout>
  );
}
