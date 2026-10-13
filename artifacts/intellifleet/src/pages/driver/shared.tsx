import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "wouter";
import { ChevronRight } from "lucide-react";
import * as authApi from "@/services/api/auth";
import * as driverApi from "@/services/api/driver";
import { formatClock, formatQty, telHref } from "@/lib/driver";
import { DASH, formatKgPartial } from "@/lib/kgDisplay";
import { fetchWithCache } from "@/lib/offlineRuntime";
import type { CrewMember, Helper, TripChip } from "@/lib/tripTypes";

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

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[4px] bg-[#e4e3df] ${className}`} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="border border-[#f0c4c7] bg-[#fff1f2] p-4 text-sm text-[#86000B]">
      <p className="font-semibold">Something went wrong</p>
      <p className="mt-1 break-words">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-[48px] items-center justify-center border border-[#86000B] bg-white px-5 text-sm font-semibold"
      >
        Try again
      </button>
    </div>
  );
}

export function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Could not load data. Check your connection.";
}

export function MissingDriverNotice() {
  return (
    <div className="border border-[#e4e3df] bg-white p-4 text-sm text-[#55565a]">
      Select a driver to view their assignments.
      <Link href="/app/driver-overview" className="mt-3 inline-flex min-h-[48px] items-center border border-[#d8d7d2] px-3 font-semibold text-black">
        Choose a driver
      </Link>
    </div>
  );
}

export function PhoneLink({ phone, children, className = "" }: { phone: string | null | undefined; children?: ReactNode; className?: string }) {
  const href = telHref(phone);
  if (!href) return <span className={className}>{children ?? phone}</span>;
  return (
    <a href={href} className={`inline-flex min-h-[48px] items-center font-semibold text-[#0b57d0] underline underline-offset-2 ${className}`}>
      {children ?? phone}
    </a>
  );
}

const BADGE_TONES: Record<string, string> = {
  sent: "border-[#33673B]/30 bg-[#f1f8f2] text-[#33673B]",
  queued: "border-[#d8d7d2] bg-[#f7f7f4] text-[#55565a]",
  failed: "border-[#86000B]/30 bg-[#fff4f4] text-[#86000B]",
  skipped: "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]",
};

export function StatusBadge({ status }: { status: string }) {
  const tone = BADGE_TONES[status.toLowerCase()] ?? "border-[#d8d7d2] bg-[#f7f7f4] text-[#55565a]";
  return (
    <span className={`inline-flex shrink-0 items-center border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${tone}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

// ---- button styles (>= 48px tap targets) ----
export const btnPrimary =
  "inline-flex min-h-[56px] w-full items-center justify-center gap-2 bg-black px-6 text-base font-bold !text-white disabled:cursor-not-allowed disabled:opacity-40";
export const btnSecondary =
  "inline-flex min-h-[48px] w-full items-center justify-center gap-2 border border-black bg-white px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";
export const inputClass = "min-h-[48px] w-full border border-[#d8d7d2] bg-white px-3 text-base disabled:bg-[#f2f2ef] disabled:text-[#55565a]";

const CHIP_TONES: Record<string, string> = {
  to_acknowledge: "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]",
  ready: "border-[#0b57d0]/30 bg-[#eef3fd] text-[#0b57d0]",
  on_trip: "border-[#33673B]/30 bg-[#f1f8f2] text-[#33673B]",
  returned: "border-[#a16819]/40 bg-[#fff8ec] text-[#a16819]",
  handover_pending: "border-[#a16819]/40 bg-[#fff8ec] text-[#a16819]",
  closed: "border-[#d8d7d2] bg-[#f7f7f4] text-[#55565a]",
};

export function ChipBadge({ chip, label }: { chip: TripChip | string; label: string }) {
  const tone = CHIP_TONES[chip] ?? CHIP_TONES.closed;
  return (
    <span data-testid="driver-trip-chip" className={`inline-flex max-w-full items-center border px-2.5 py-1 text-xs font-bold ${tone}`}>
      <span className="truncate">{label}</span>
    </span>
  );
}

export function CrewList({ crew, helpers }: { crew?: CrewMember[]; helpers?: Helper[] }) {
  const people: Array<{ id: string; name: string; role: string; phone: string | null }> =
    crew && crew.length > 0
      ? crew.map((c) => ({ id: String(c.id), name: c.name, role: c.role, phone: c.phone }))
      : (helpers ?? []).map((h) => ({ id: String(h.id), name: h.name, role: "helper", phone: h.phone }));
  if (people.length === 0) return null;
  return (
    <div className="mt-2 text-sm">
      {people.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-x-1">
          <span className="capitalize">{p.role}:</span>
          <span>{p.name}</span>
          {telHref(p.phone) && (
            <>
              <span>&middot;</span>
              <PhoneLink phone={p.phone} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export function OfflineNote({ offline, savedAt }: { offline: boolean; savedAt?: number | null }) {
  if (!offline) return null;
  const at = savedAt ? formatClock(new Date(savedAt).toISOString()) : "";
  return (
    <div role="status" data-testid="driver-offline-note" className="mb-3 border border-[#e6c36a] bg-[#fff6dd] p-3 text-sm font-semibold text-[#6b4a00]">
      Offline - showing saved data{at ? ` (saved ${at})` : ""}
    </div>
  );
}

export function BlockerNote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <p data-testid="driver-blocker" className="border-l-2 border-[#a16819] bg-[#fff8ec] p-3 text-sm font-semibold text-[#6b4a00]">
      {text}
    </p>
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
  toasts = [...toasts, item];
  toastListeners.forEach((l) => l());
  window.setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id);
    toastListeners.forEach((l) => l());
  }, 6000);
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
  const tone = (t: ToastTone) =>
    t === "error" ? "bg-[#86000B] !text-white" : t === "warn" ? "bg-[#a16819] !text-white" : "bg-black !text-white";
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 mx-auto grid max-w-[640px] gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} role="status" className={`pointer-events-auto px-4 py-3 text-sm font-semibold shadow-lg ${tone(t.tone)}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---- numbers that may be unknown or partial (see lib/kgDisplay.ts) ----

// "564.67 kg", or "354 kg+" with a small note "1 line without weight" when part of the total has no weight, or a dash.
export function KgValue({ kg, unknownLines = 0, className = "" }: { kg: number | null | undefined; unknownLines?: number; className?: string }) {
  const { text, note } = formatKgPartial(kg, unknownLines, 2);
  return (
    <span className={className} data-testid="driver-kg">
      {text}
      {note && <span className="block text-[10px] font-normal leading-tight text-[#6b4a00]">{note}</span>}
    </span>
  );
}

// Packs are unknown (a dash), never 0, when no line of the order is counted in packs.
export function PacksValue({ packs }: { packs: number | null | undefined }) {
  return <span data-testid="driver-packs">{packs === null || packs === undefined ? DASH : formatQty(packs)}</span>;
}

export function Avatar({ name, size = 36 }: { name: string | null | undefined; size?: number }) {
  const initials = (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  return (
    <span aria-hidden="true" style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-black text-xs font-bold !text-white">
      {initials}
    </span>
  );
}

// One real icon + label + chevron row (profile / trip detail sections): always a real link.
export function NavRow({ href, icon, label, detail, testId }: { href: string; icon: ReactNode; label: string; detail?: ReactNode; testId?: string }) {
  return (
    <Link href={href} data-testid={testId} className="flex min-h-[52px] items-center gap-3 border-b border-[#efeeeb] px-4 text-sm font-semibold last:border-b-0">
      <span className="shrink-0 text-[#55565a]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && <span className="shrink-0 text-xs font-normal text-[#77787b]">{detail}</span>}
      <ChevronRight size={18} className="shrink-0 text-[#77787b]" />
    </Link>
  );
}
