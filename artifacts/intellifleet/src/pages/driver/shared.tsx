import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "wouter";
import * as authApi from "@/services/api/auth";
import * as driverApi from "@/services/api/driver";
import { formatClock } from "@/lib/driver";
import { fetchWithCache } from "@/lib/offlineRuntime";
import { useT } from "./i18n";
import { C, FONT, PrimaryButton } from "./ui";

export interface DriverScope {
  // Staff id forwarded as ?driver_id= - only ever set for admins viewing a driver.
  adminDriverId: string | null;
  isAdmin: boolean;
  sessionLoading: boolean;
  // Set when an admin opened the page without ?driver_id=.
  missingDriverId: boolean;
}

export function useDriverScope(): DriverScope {
  const [params] = useSearchParams();
  const session = useQuery({
    queryKey: ["driver-session"],
    queryFn: () => authApi.getSession(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const role = session.data?.user.role.toLowerCase() ?? null;
  const isAdmin = role === "admin";
  const fromUrl = params.get("driver_id");
  return {
    adminDriverId: isAdmin ? fromUrl : null,
    isAdmin,
    sessionLoading: session.isLoading,
    missingDriverId: isAdmin && !fromUrl,
  };
}

export function useDriverMe(scope: DriverScope) {
  return useQuery({
    queryKey: ["driver-me", scope.adminDriverId],
    queryFn: async () => (await fetchWithCache("me", undefined, scope.adminDriverId, () => driverApi.getMe(scope.adminDriverId))).data,
    enabled: !scope.sessionLoading && !scope.missingDriverId,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Could not load data. Check your connection.";
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div role="alert" style={{ background: C.card, borderRadius: 18, padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 17, fontWeight: 700 }}>{t.somethingWrong}</div>
      <div style={{ fontSize: 14, color: C.sub, overflowWrap: "anywhere" }}>{message}</div>
      <PrimaryButton height={56} fontSize={17} onClick={onRetry}>
        {t.tryAgain}
      </PrimaryButton>
    </div>
  );
}

export function MissingDriverNotice() {
  const t = useT();
  return (
    <div style={{ background: C.card, borderRadius: 18, padding: 18, fontSize: 15, color: C.sub, display: "flex", flexDirection: "column", gap: 12 }}>
      {t.selectDriver}
      <Link href="/app/driver-overview" style={{ height: 56, borderRadius: 16, border: `1px solid ${C.field}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.ink, fontWeight: 700 }}>
        {t.chooseDriver}
      </Link>
    </div>
  );
}

export function OfflineNote({ offline, savedAt }: { offline: boolean; savedAt?: number | null }) {
  const t = useT();
  if (!offline) return null;
  const at = savedAt ? formatClock(new Date(savedAt).toISOString()) : "";
  return (
    <div role="status" data-testid="driver-offline-note" style={{ padding: "10px 14px", borderRadius: 14, background: C.amberBg, color: C.amber, fontSize: 14, fontWeight: 500 }}>
      {t.offlineData(at)}
    </div>
  );
}

// ---- tiny toast store (module level so any screen/handler can raise one) ----
export type ToastTone = "info" | "warn" | "error";
interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
}
let toastSeq = 0;
let toasts: ToastItem[] = [];
const toastListeners = new Set<() => void>();

export function showToast(text: string, tone: ToastTone = "info") {
  const item = { id: ++toastSeq, text, tone };
  toasts = [item]; // one at a time: a quick run of stops must not stack toasts over the screen
  toastListeners.forEach((l) => l());
  window.setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== item.id);
    toastListeners.forEach((l) => l());
  }, 2500);
}

export function ToastHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    toastListeners.add(l);
    return () => {
      toastListeners.delete(l);
    };
  }, []);
  if (toasts.length === 0) return null;
  const bg = (tone: ToastTone) => (tone === "error" ? C.so : tone === "warn" ? C.amber : C.ink);
  return (
    <div aria-live="polite" style={{ pointerEvents: "none", position: "fixed", left: 0, right: 0, bottom: "calc(150px + env(safe-area-inset-bottom))", zIndex: 50 /* below sheets (60): a toast never covers a sheet button */, display: "grid", gap: 8, padding: "0 20px", maxWidth: 560, margin: "0 auto", fontFamily: FONT }}>
      {toasts.map((x) => (
        <div key={x.id} role="status" data-testid="driver-toast" style={{ pointerEvents: "auto", padding: "14px 16px", borderRadius: 14, background: bg(x.tone), color: "#FFFFFF", fontSize: 15, fontWeight: 700, boxShadow: "0 6px 20px rgba(0,0,0,.18)" }}>
          {x.text}
        </div>
      ))}
    </div>
  );
}
