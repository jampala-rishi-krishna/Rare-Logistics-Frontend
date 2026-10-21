// Shared building blocks for Driver Overview v2. Colours come ONLY from the dashboard tokens (src/index.css via
// src/lib/themeTokens.ts) as Tailwind theme classes or hsl(var(--token)) arbitrary values. No hex literals here.
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileWarning,
  ImageOff,
  MapPin,
  MapPinOff,
  MessageSquareWarning,
  PackageMinus,
  Phone,
  X,
} from "lucide-react";
import * as overviewApi from "@/services/api/overview";
import { telHref } from "@/lib/driver";
import { errorInfo } from "@/lib/officer";
import {
  ATTENTION_TONE,
  OUTCOME,
  attentionLabel,
  outcomeKey,
  isCancelledOutcome,
  photoCaption,
} from "@/lib/overviewModel";
import type { PhotoLike, Tone } from "@/lib/overviewModel";
export { useSessionRole } from "@/components/fleet-health/hooks";
export {
  manilaDateTime as fmtDateTime,
  manilaTime as fmtTime,
} from "@/lib/overviewModel";

export const TONE_CLASS: Record<Tone, string> = {
  good: "border-[hsl(var(--status-success)_/_0.35)] bg-[hsl(var(--success-bg))] text-[hsl(var(--status-success))]",
  warn: "border-[hsl(var(--status-warning)_/_0.35)] bg-[hsl(var(--warning-bg))] text-[hsl(var(--status-warning))]",
  bad: "border-[hsl(var(--destructive)_/_0.35)] bg-[hsl(var(--destructive-bg))] text-destructive",
  info: "border-[hsl(var(--info)_/_0.35)] bg-[hsl(var(--info-bg))] text-[hsl(var(--info))]",
  neutral: "border-border bg-muted text-foreground",
};

export const TEXT_TONE: Record<Tone, string> = {
  good: "text-[hsl(var(--status-success))]",
  warn: "text-[hsl(var(--status-warning))]",
  bad: "text-destructive",
  info: "text-[hsl(var(--info))]",
  neutral: "text-foreground",
};

export const focusRing =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--info))] focus-visible:ring-offset-1";
export const inputClass = `h-9 rounded-[6px] border border-border bg-card px-2.5 text-[13px] text-foreground ${focusRing}`;
export const buttonClass = `inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border border-border bg-card px-3 text-[13px] font-semibold text-foreground hover:bg-muted disabled:opacity-50 ${focusRing}`;
export const primaryButtonClass = `inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] bg-foreground px-3.5 text-[13px] font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 ${focusRing}`;
export const iconButtonClass = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40 ${focusRing}`;

export function Chip({
  tone = "neutral",
  children,
  icon,
  testId,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: ReactNode;
  testId?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      data-testid={testId}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 text-[12px] font-semibold leading-4 ${TONE_CLASS[tone]}`}
    >
      {icon}
      {children}
    </span>
  );
}

const ATTENTION_ICON: Record<string, ReactNode> = {
  no_activity: <Clock size={12} aria-hidden />,
  not_delivered: <span aria-hidden>✕</span>,
  partial: <span aria-hidden>◐</span>,
  problem_open: <MessageSquareWarning size={12} aria-hidden />,
  far_checkin: <MapPin size={12} aria-hidden />,
  no_gps: <MapPinOff size={12} aria-hidden />,
  invoice_missing: <FileWarning size={12} aria-hidden />,
  invoice_discrepancy: <FileWarning size={12} aria-hidden />,
  order_removed: <PackageMinus size={12} aria-hidden />,
  photo_missing: <ImageOff size={12} aria-hidden />,
};

export function AttentionChip({
  flag,
  onClick,
}: {
  flag: { code: string; label?: string | null };
  onClick?: () => void;
}) {
  const tone = ATTENTION_TONE[flag.code] ?? "warn";
  const body = (
    <Chip
      tone={tone}
      icon={
        ATTENTION_ICON[flag.code] ?? <AlertTriangle size={12} aria-hidden />
      }
      testId={`attention-${flag.code}`}
    >
      {attentionLabel(flag)}
    </Chip>
  );
  if (!onClick) return body;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[4px] ${focusRing}`}
      title="Show where"
    >
      {body}
    </button>
  );
}

export function OutcomeChip({
  outcome,
}: {
  outcome: string | null | undefined;
}) {
  const k = outcomeKey(outcome);
  if (!k) return outcome ? <Chip>{outcome}</Chip> : null;
  const o = OUTCOME[k];
  return (
    <Chip
      tone={o.tone}
      testId={`outcome-${k}`}
      title={outcome ?? undefined}
      icon={<span aria-hidden>{o.glyph}</span>}
    >
      {isCancelledOutcome(outcome) ? "Cancelled" : o.word.charAt(0).toUpperCase() + o.word.slice(1)}
    </Chip>
  );
}

export function CallLink({
  name,
  phone,
  role,
}: {
  name: string;
  phone: string | null | undefined;
  role?: string;
}) {
  const tel = telHref(phone ?? null);
  const who = role === "helper" ? `${name} (Helper)` : role === "driver" ? `${name} (Driver)` : name;
  if (!tel) return <span className="whitespace-nowrap">{who}</span>;
  return (
    <a
      href={tel}
      className={`relative z-[1] inline-flex items-center gap-1 whitespace-nowrap rounded-[4px] underline decoration-border underline-offset-2 hover:decoration-foreground ${focusRing}`}
      aria-label={`Call ${who}`}
    >
      <Phone size={12} aria-hidden />
      {who}
    </a>
  );
}

export function Skeleton({ className = "h-10" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-[4px] bg-muted ${className}`}
    />
  );
}

export function ErrorLine({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const status = (error as { status?: number } | null)?.status;
  const text =
    status === 403
      ? "You do not have access to this data."
      : errorInfo(error).message;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-[6px] border border-[hsl(var(--destructive)_/_0.35)] bg-[hsl(var(--destructive-bg))] px-3 py-2 text-[13px] text-destructive"
    >
      <AlertTriangle size={14} className="shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`shrink-0 rounded-[4px] border border-destructive bg-card px-2.5 py-0.5 text-[12px] font-semibold text-destructive ${focusRing}`}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export const ErrorNote = ErrorLine;

// ---- photos ------------------------------------------------------------------------------------------------------

export function usePhoto(id: number | string, size: "thumb" | "full") {
  return useQuery({
    queryKey: ["overview-photo", String(id), size],
    queryFn: () => overviewApi.fetchMediaObjectUrl(id, size),
    staleTime: 30 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
}

/** A photo thumbnail (size=thumb) with its caption; click opens the full viewer. */
export function Thumb({
  photo,
  onOpen,
  small = false,
  caption = true,
}: {
  photo: PhotoLike;
  onOpen: () => void;
  small?: boolean;
  caption?: boolean;
}) {
  const q = usePhoto(photo.photo_id, "thumb");
  const box = small ? "h-10 w-10" : "h-20 w-20";
  const text = photoCaption(photo);
  return (
    <figure className="m-0 grid w-fit gap-1">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open photo: ${text}`}
        data-testid="photo-thumb"
        className={`relative z-[1] block overflow-hidden rounded-[4px] border border-border bg-muted ${box} ${focusRing}`}
      >
        {q.data ? (
          <img src={q.data} alt="" className="h-full w-full object-cover" />
        ) : q.isError ? (
          <ImageOff
            size={16}
            className="m-auto text-muted-foreground"
            aria-hidden
          />
        ) : (
          <span className="block h-full w-full animate-pulse bg-muted" />
        )}
      </button>
      {caption && (
        <figcaption
          className="max-w-[180px] text-[11px] leading-4 text-muted-foreground"
          data-testid="photo-caption"
        >
          {text}
        </figcaption>
      )}
    </figure>
  );
}

/** Full-size viewer (size=full) with ◀ ▶ through the given list; Esc closes. */
export function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
}: {
  photos: PhotoLike[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const photo = photos[index];
  const q = usePhoto(photo?.photo_id ?? "", "full");
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, true);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft" && index > 0) onIndex(index - 1);
      else if (e.key === "ArrowRight" && index < photos.length - 1)
        onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, photos.length, onClose, onIndex]);
  if (!photo) return null;
  const nav = `inline-flex h-11 w-11 items-center justify-center rounded-[6px] bg-card text-foreground disabled:opacity-40 ${focusRing}`;
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
      data-testid="photo-viewer"
      className="fixed inset-0 z-[1100] flex flex-col bg-[hsl(var(--foreground)_/_0.92)] p-3 text-primary-foreground sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="text-[13px] font-semibold tabular-nums"
          data-testid="photo-viewer-caption"
        >
          {photoCaption(photo)}{" "}
          <span className="font-normal">
            · {index + 1} of {photos.length}
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className={nav}
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 py-3">
        <button
          type="button"
          onClick={() => onIndex(index - 1)}
          disabled={index === 0}
          aria-label="Previous photo"
          className={nav}
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex h-full min-w-0 flex-1 items-center justify-center">
          {q.data ? (
            <img
              src={q.data}
              alt={photoCaption(photo)}
              className="max-h-full max-w-full object-contain"
            />
          ) : q.isError ? (
            <span className="text-[13px]">Photo could not be loaded.</span>
          ) : (
            <span className="text-[13px]">Loading…</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onIndex(index + 1)}
          disabled={index >= photos.length - 1}
          aria-label="Next photo"
          className={nav}
        >
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );
}

/** One viewer per screen area: open(list, i). */
export function usePhotoViewer() {
  const [state, setState] = useState<{
    photos: PhotoLike[];
    index: number;
  } | null>(null);
  const node = state ? (
    <PhotoViewer
      photos={state.photos}
      index={state.index}
      onIndex={(i) => setState((s) => (s ? { ...s, index: i } : s))}
      onClose={() => setState(null)}
    />
  ) : null;
  return {
    open: (photos: PhotoLike[], index: number) => setState({ photos, index }),
    node,
    isOpen: state !== null,
  };
}

// ---- focus trap ----------------------------------------------------------------------------------------------------

const FOCUSABLE =
  "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

/** Keeps Tab inside `ref` while active; focuses the first control on open and restores the previous focus on close. */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (!el) return;
    const before = document.activeElement as HTMLElement | null;
    const first =
      el.querySelector<HTMLElement>("[data-autofocus]") ??
      el.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      // a nested modal (the photo viewer inside the drawer) owns Tab while it is open
      const owner = (document.activeElement as HTMLElement | null)?.closest(
        "[aria-modal='true']",
      );
      if (owner && owner !== el) return;
      const items = Array.from(
        el.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (items.length === 0) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === a || !el.contains(document.activeElement))
      ) {
        e.preventDefault();
        z.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === z || !el.contains(document.activeElement))
      ) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before && document.contains(before))
        before.focus({ preventScroll: true });
    };
  }, [ref, active]);
}

/** Re-renders every `ms` so "Updated 12 s ago" / "4 min ago" stay current without refetching. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
