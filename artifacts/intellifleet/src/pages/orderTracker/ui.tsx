// Shared Order Tracker primitives (approved design, docs/design/order-tracker/). Colours come only from themeTokens /
// index.css variables - no hex literals in Order Tracker files.
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { getSupport } from "@/services/api/auth";
import { telHref } from "@/lib/driver";
import "./ui.css";

export type Tone = "neutral" | "info" | "positive" | "warning" | "negative" | "pending" | "unknown";

// Delivery status -> chip tone. Text is always shown; colour never carries meaning alone.
const STATUS_TONE: Record<string, Tone> = {
  "Not yet loaded": "pending", Loaded: "neutral", "Out for delivery": "info", Arrived: "info",
  Delivered: "positive", "Partly delivered": "warning", "Not delivered": "negative", "Back at warehouse": "neutral",
};
const PAYMENT_TONE: Record<string, Tone> = { Paid: "positive", "Partly paid": "warning", Unpaid: "neutral" };

export const statusTone = (status: string | null | undefined): Tone => STATUS_TONE[status ?? ""] ?? "unknown";
export const paymentTone = (status: string | null | undefined): Tone => PAYMENT_TONE[status ?? ""] ?? "unknown";

/** One chip component for every status. size "lg" = order header; "solid" = phone header (solid tint, white text). */
export function Chip({ tone, children, size = "sm", solid = false }: { tone: Tone; children: ReactNode; size?: "sm" | "md" | "lg"; solid?: boolean }) {
  return <span className={`otc otc-${tone} otc-${size}${solid ? " otc-solid" : ""}`}>{children}</span>;
}
export const StatusChip = ({ status, size, solid }: { status: string; size?: "sm" | "md" | "lg"; solid?: boolean }) =>
  <Chip tone={statusTone(status)} size={size} solid={solid}>{status}</Chip>;
export const PaymentChip = ({ status, size }: { status: string | null | undefined; size?: "sm" | "md" | "lg" }) =>
  <Chip tone={paymentTone(status)} size={size}>{status && PAYMENT_TONE[status] ? status : "Unknown"}</Chip>;

/** 40px rounded icon tile; tinted when the section carries a status. */
export function IconTile({ tone = "neutral", children, size = 40 }: { tone?: Tone; children: ReactNode; size?: number }) {
  return <span className={`ot-tile ot-tile-${tone}`} style={{ width: size, height: size }} aria-hidden="true">{children}</span>;
}

/** The 13px muted "Source · as of HH:MM" line. Never remove it. */
export function SourceLine({ source, asOf, children }: { source: string; asOf?: string | null; children?: ReactNode }) {
  return <p className="ot-src">{source}{asOf !== undefined ? <> · as of {hhmm(asOf)}</> : null}{children}</p>;
}

/** Manila HH:MM, or "—" when the time is missing / unparsable. */
export function hhmm(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}
/** "15 Oct · 10:29" in Manila. */
export function dayTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", day: "numeric", month: "short" }).format(d)} · ${hhmm(value)}`;
}
/** "Today, Thu 15 Oct" / "Thu 15 Oct" for a YYYY-MM-DD date. */
export function dayLabel(ymd: string, today: string): string {
  const d = new Date(`${ymd}T12:00:00+08:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  const text = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", weekday: "short", day: "numeric", month: "short" }).format(d).replace(",", "");
  return ymd === today ? `Today, ${text}` : text;
}
/** "2 min ago" / "1 h ago" relative to now; "—" when unknown. */
export function ago(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "—";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "—";
  const min = Math.max(0, Math.round((now - t) / 60000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
/** "₱48,250" from a decimal string; "—" when missing. Currency symbol only because invoices are PHP. */
export function peso(value: unknown): string {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return "—";
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
}
/** Backend fact strings that start with "Not recorded" are explanations, not values. */
export const isMissing = (value: unknown): boolean =>
  value === null || value === undefined || value === "" || (typeof value === "string" && /^not recorded/i.test(value.trim()));

/** Existing dispatch number (DISPATCH_PHONE setting via /auth/support). Never driver/helper phones. */
export function useLogisticsTel(): string | null {
  const support = useQuery({ queryKey: ["auth-support"], queryFn: getSupport, staleTime: 60000, retry: false });
  return telHref(support.data?.dispatch_phone ?? null);
}

/** "Call Logistics": a tel: link when the dispatch number is set, hidden when no dispatch number is configured. */
export function CallLogistics({ variant = "solid", label = "Call Logistics", iconOnly = false, className = "" }: { variant?: "solid" | "outline" | "light"; label?: string; iconOnly?: boolean; className?: string }) {
  const tel = useLogisticsTel();
  const cls = `ot-btn ot-btn-${variant}${iconOnly ? " ot-btn-icon" : ""} ${className}`;
  const body = <><Phone size={iconOnly ? 19 : 18} strokeWidth={2.2} aria-hidden="true" />{iconOnly ? null : label}</>;
  return tel
    ? <a className={cls} href={tel} aria-label={iconOnly ? label : undefined}>{body}</a>
    : null;
}

/** Skeleton block in the shape of the content it stands in for. */
export const Skeleton = ({ h = 16, w = "100%", r = 8 }: { h?: number; w?: number | string; r?: number }) =>
  <span className="ot-skel" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;

/** One-line error with Retry inside the section that failed. */
export function SectionError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="ot-err" role="alert"><span>{message}</span>{onRetry && <button type="button" className="ot-btn ot-btn-outline ot-btn-sm" onClick={onRetry}>Retry</button>}</div>;
}
