import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardCheck, History, LogOut, ArrowLeft, Clock } from "lucide-react";
import * as authApi from "@/services/api/auth";
import { clearStoredSessionId } from "@/services/api/client";
import { isOfficerReadOnly } from "@/lib/roles";
import { errorInfo, statusLabel } from "@/lib/officer";

export function useOfficerSession() {
  const query = useQuery({ queryKey: ["officer-session"], queryFn: () => authApi.getSession(), staleTime: 5 * 60_000, retry: 1 });
  const user = query.data?.user ?? null;
  const role = (user?.role ?? "").toLowerCase();
  return { user, role, readOnly: isOfficerReadOnly(role), isOfficer: role === "logistics_officer", isAdmin: role === "admin" };
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

export function fmtDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(d);
}

const TONES: Record<string, string> = {
  received: "bg-[#edf6f0] text-[#1e7b44] border-[#cddfd2]",
  closed: "bg-[#edf6f0] text-[#1e7b44] border-[#cddfd2]",
  missing: "bg-[#fff1f2] text-[#86000B] border-[#f0c4c7]",
  discrepancy: "bg-[#fff6e5] text-[#8a5a00] border-[#f0d9a8]",
  pending: "bg-[#f2f2ef] text-[#55565a] border-[#d8d7d2]",
  acknowledged: "bg-[#fff6e5] text-[#8a5a00] border-[#f0d9a8]",
};

export function StatusPill({ status }: { status: string | null | undefined }) {
  const tone = TONES[status ?? "pending"] ?? TONES.pending;
  return <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-semibold ${tone}`}>{statusLabel(status)}</span>;
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const info = errorInfo(error);
  const status = (error as { status?: number } | null)?.status;
  const text = status === 403 ? "You do not have access to this screen." : info.message;
  return (
    <div role="alert" className="flex items-start gap-3 border border-[#f0c4c7] bg-[#fff1f2] p-4 text-sm text-[#86000B]">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 break-words">{text}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="min-h-[36px] shrink-0 border border-[#86000B] px-3 text-xs font-semibold">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyBox({ children }: { children: ReactNode }) {
  return <div className="border border-[#e4e3df] bg-white p-6 text-center text-sm text-[#55565a]">{children}</div>;
}

export function LoadingBox({ label = "Loading..." }: { label?: string }) {
  return <div className="border border-[#e4e3df] bg-white p-6 text-center text-sm text-[#77787b]">{label}</div>;
}

export function Notice({ tone, children }: { tone: "good" | "warn" | "bad"; children: ReactNode }) {
  const cls = tone === "good" ? "border-[#cddfd2] bg-[#edf6f0] text-[#1e7b44]" : tone === "warn" ? "border-[#f0d9a8] bg-[#fff6e5] text-[#8a5a00]" : "border-[#f0c4c7] bg-[#fff1f2] text-[#86000B]";
  return (
    <div role="status" className={`border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

// Officer pages deliberately use a minimal layout, not the dispatcher AppShell.
export default function OfficerLayout({ children, title }: { children: ReactNode; title?: string }) {
  const [location, setLocation] = useLocation();
  const session = useOfficerSession();
  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* best effort */
    }
    clearStoredSessionId();
    setLocation("/login");
  };
  const tabs: Array<[string, string, typeof Clock]> = [
    ["/officer/pending", "Pending", ClipboardCheck],
    ["/officer/outstanding", "Outstanding", Clock],
    ["/officer/history", "History", History],
  ];
  const active = (href: string) => location === href || (href === "/officer/pending" && location.startsWith("/officer/handover"));
  const backHref = session.role === "admin" ? "/admin/users" : session.role === "dispatcher" ? "/app/tower" : null;
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#f2f2ef] text-black">
      <header className="sticky top-0 z-20 border-b border-[#e4e3df] bg-white">
        <div className="mx-auto flex min-h-[56px] max-w-[1100px] items-center justify-between gap-3 px-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{title ?? "Invoice validation"}</div>
            <div className="truncate text-[11px] text-[#77787b]">
              {session.user?.fullName ?? "IntelliFleet"}
              {session.readOnly ? " - read only" : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {backHref && (
              <Link href={backHref} className="inline-flex min-h-[44px] items-center gap-1 border border-[#d8d7d2] bg-white px-3 text-sm font-semibold" data-testid="officer-back">
                <ArrowLeft size={15} />
                <span className="hidden sm:inline">Dashboard</span>
              </Link>
            )}
            <button type="button" onClick={() => void logout()} data-testid="officer-logout" className="inline-flex min-h-[44px] items-center gap-2 border border-[#d8d7d2] bg-white px-4 text-sm font-semibold">
              <LogOut size={16} />
              Log out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1100px] px-2" aria-label="Officer sections">
          {tabs.map(([href, label, Icon]) => (
            <Link
              key={href}
              href={href}
              data-testid={`officer-nav-${label.toLowerCase()}`}
              className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 border-b-2 text-sm font-semibold sm:flex-none sm:px-6 ${active(href) ? "border-black text-black" : "border-transparent text-[#77787b]"}`}
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-[1100px] px-4 pb-20 pt-5">{children}</main>
    </div>
  );
}
