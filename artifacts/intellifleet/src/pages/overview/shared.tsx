import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import * as authApi from "@/services/api/auth";
import type { Tone } from "@/lib/overview";
import { errorInfo } from "@/lib/officer";

export function useSessionRole() {
  const query = useQuery({ queryKey: ["overview-session"], queryFn: () => authApi.getSession(), staleTime: 5 * 60_000, retry: 1 });
  const role = (query.data?.user.role ?? "").toLowerCase();
  return { role, isAdmin: role === "admin", loaded: query.isSuccess };
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(d);
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);
}

const TONE_CLASS: Record<Tone, string> = {
  good: "border-[#cddfd2] bg-[#edf6f0] text-[#1e7b44]",
  warn: "border-[#f0d9a8] bg-[#fff6e5] text-[#8a5a00]",
  bad: "border-[#f0c4c7] bg-[#fff1f2] text-[#86000B]",
  info: "border-[#c9d7f0] bg-[#eef3fc] text-[#1d4ed8]",
  neutral: "border-[#d8d7d2] bg-[#f2f2ef] text-[#55565a]",
};

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap border px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}>{children}</span>;
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const status = (error as { status?: number } | null)?.status;
  const text = status === 403 ? "You do not have access to this data." : errorInfo(error).message;
  return (
    <div role="alert" className="flex items-start gap-3 border border-[#f0c4c7] bg-[#fff1f2] p-3 text-sm text-[#86000B]">
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1 break-words">{text}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 border border-[#86000B] px-2.5 py-1 text-xs font-semibold">
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="border border-[#e4e3df] bg-white p-6 text-center text-sm text-[#55565a]">{children}</div>;
}

export const inputClass = "min-h-[38px] w-full border border-[#d8d7d2] bg-white px-2.5 text-sm outline-none focus:border-black";
export const buttonClass = "inline-flex min-h-[38px] items-center justify-center gap-2 border border-[#d8d7d2] bg-white px-3 text-sm font-semibold hover:bg-[#efefed] disabled:opacity-40";
export const primaryButtonClass = "inline-flex min-h-[38px] items-center justify-center gap-2 bg-black px-4 text-sm font-semibold text-white disabled:opacity-40";

export function Skeleton({ className = "h-10" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[4px] bg-[#e4e3df] ${className}`} />;
}
