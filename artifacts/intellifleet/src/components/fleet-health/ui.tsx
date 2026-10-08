import { useState, type ReactNode } from "react";
import { AlertTriangle, CircleHelp, Info, RefreshCw, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MaintainedTruck, Risk, ServiceKey, ServiceState } from "@/services/api/fleetHealth";
import {
  CAPACITY_UNCONFIRMED_TIP,
  EM_DASH,
  RISK_BAND_LABELS,
  SERVICE_LABELS,
  TONES,
  formatDayMonth,
  formatUsage,
  riskTone,
  serviceStatusLabel,
  serviceTipLines,
  serviceTone,
  usageBarFill,
  type KpiTileData,
  type Tone,
  trackerLabel,
  trackerTone,
} from "@/lib/fleetHealth";
import type { TrackerInfo } from "@/services/api/fleetHealth";

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

// ------------------------------------------------------------------------------------------------ form + button styles
// NB: index.css has an unlayered `button, input, select { font: inherit }` that beats Tailwind's layered text-size
// utilities, so sizes on controls use the important modifier (like ToolbarControls does).
export const fieldClass =
  "h-11 w-full min-w-0 rounded-[4px] border border-[#d8d7d2] bg-white px-3 text-[15px]! leading-none! text-black outline-none transition-colors placeholder:text-[#a3a29d] focus:border-[#0b0b0b] focus-visible:outline-none disabled:bg-[#f2f2ef] disabled:text-[#77787b] md:h-10 md:text-sm!";
export const textareaClass =
  "min-h-[84px] w-full min-w-0 rounded-[4px] border border-[#d8d7d2] bg-white px-3 py-2.5 text-[15px]! leading-snug! text-black outline-none transition-colors placeholder:text-[#a3a29d] focus:border-[#0b0b0b] focus-visible:outline-none md:text-sm!";
export const btn =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[4px] border border-[#d8d7d2] bg-white px-4 text-sm! font-medium leading-none! text-[#0b0b0b] transition-colors hover:border-[#0b0b0b] hover:bg-[#fafaf8] disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:px-3";
export const btnPrimary =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[4px] border border-[#0b0b0b] bg-[#0b0b0b] px-4 text-sm! font-medium leading-none! text-white transition-colors hover:bg-[#242424] disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:px-3";
export const btnDanger =
  "inline-flex h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[4px] border border-[#86000B] bg-white px-4 text-sm! font-medium leading-none! text-[#86000B] transition-colors hover:bg-[#fbeeee] disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:px-3";
export const btnGhost =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] px-2.5 text-[13px]! font-medium leading-none! text-[#55565a] transition-colors hover:bg-[#f2f2ef] hover:text-black disabled:opacity-50";
export const iconBtn =
  "inline-grid h-11 w-11 shrink-0 place-items-center rounded-[4px] border border-[#d8d7d2] bg-white text-[#55565a] transition-colors hover:border-[#0b0b0b] hover:text-black disabled:opacity-50 md:h-8 md:w-8";

// ------------------------------------------------------------------------------------------------ tooltip
/**
 * A keyboard- and touch-accessible tooltip. The trigger is a real <button>: it opens on hover and focus, and a tap
 * or click toggles it (Radix alone ignores touch taps). Content is short and exact: formulas, not prose.
 */
export function Tip({ content, label, children, className, side = "top", asSpan }: { content: ReactNode; label: string; children: ReactNode; className?: string; side?: "top" | "bottom" | "left" | "right"; asSpan?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen} delayDuration={120}>
      <TooltipTrigger asChild>
        {asSpan ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={label}
            className={cx("cursor-help rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2", className)}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setOpen((o) => !o);
              }
            }}
          >
            {children}
          </span>
        ) : (
          <button
            type="button"
            aria-label={label}
            className={cx("cursor-help rounded-[2px] text-left focus-visible:outline-2 focus-visible:outline-offset-2", className)}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            {children}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} collisionPadding={12} className="z-[100] max-w-[min(340px,calc(100vw-24px))] rounded-[4px] bg-[#0b0b0b] px-3 py-2.5 text-[12px] leading-[1.45] text-white shadow-lg">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

/** A small (i) button that explains a number. */
export function FormulaTip({ lines, label = "How this is calculated", className }: { lines: string[]; label?: string; className?: string }) {
  return (
    <Tip
      label={label}
      className={cx("inline-grid h-5 w-5 place-items-center text-[#9a9994] hover:text-black md:h-4 md:w-4", className)}
      content={
        <div className="grid gap-1">
          {lines.map((line, i) => (
            <div key={i} className={i === 0 ? "font-medium" : "text-[#d6d6d1]"}>
              {line}
            </div>
          ))}
        </div>
      }
    >
      <Info size={13} aria-hidden />
    </Tip>
  );
}

// ------------------------------------------------------------------------------------------------ pills / badges
export function Pill({ tone, children, icon: Icon, dashed, className, title }: { tone: Tone; children: ReactNode; icon?: LucideIcon; dashed?: boolean; className?: string; title?: string }) {
  const t = TONES[tone];
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-[3px] text-[11px] font-semibold leading-none", dashed && "border-dashed", className)}
      style={{ color: t.fg, background: t.bg, borderColor: t.border }}
    >
      {Icon ? <Icon size={11} aria-hidden /> : <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: t.solid }} />}
      {children}
    </span>
  );
}

export function TrackerPill({ tracker }: { tracker: TrackerInfo }) {
  const tone = trackerTone(tracker);
  return (
    <Pill tone={tone} className={tracker.status === "live" ? "" : ""}>
      {tracker.status === "live" && <span aria-hidden className="live-dot -ml-0.5 mr-0.5 h-1.5 w-1.5 rounded-full bg-[#1e7b44]" />}
      {trackerLabel(tracker)}
    </Pill>
  );
}

export function CapacityMarker({ compact }: { compact?: boolean }) {
  return (
    <Tip label="Capacity unconfirmed" content={CAPACITY_UNCONFIRMED_TIP} className="inline-flex">
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-[3px] border border-dashed border-[#e6c36a] bg-[#fff6dd] px-1.5 py-[2px] text-[10px] font-semibold leading-none text-[#8a5a00]">
        <CircleHelp size={10} aria-hidden />
        {compact ? "Cap. unconfirmed" : "Capacity unconfirmed"}
      </span>
    </Tip>
  );
}

export function RiskBreakdownTip({ risk }: { risk: Risk }) {
  return (
    <div className="grid min-w-[240px] gap-2">
      <div className="font-medium">
        Risk score {risk.score} / 100 ({RISK_BAND_LABELS[risk.band]})
      </div>
      <div className="grid gap-1.5">
        {risk.breakdown.map((b) => (
          <div key={b.key} className="grid gap-0.5 border-t border-white/15 pt-1.5 first:border-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <span>{b.label}</span>
              <span className="mono text-[11px]">
                {b.points} / {b.max}
              </span>
            </div>
            <div className="text-[#d6d6d1]">{b.detail}</div>
            <div className="text-[11px] text-[#a9a9a4]">{b.formula}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RiskBadge({ risk, withTip = true, size = "md" }: { risk: Risk; withTip?: boolean; size?: "sm" | "md" | "lg" }) {
  const t = TONES[riskTone(risk.band)];
  const badge = (
    <span
      className={cx("inline-flex items-center gap-2 whitespace-nowrap rounded-[4px] border font-semibold leading-none", size === "lg" ? "px-3 py-2 text-sm" : size === "sm" ? "px-1.5 py-1 text-[11px]" : "px-2 py-1.5 text-xs")}
      style={{ color: t.fg, background: t.bg, borderColor: t.border }}
    >
      <span className="mono font-semibold">{risk.score}</span>
      <span>{RISK_BAND_LABELS[risk.band]}</span>
    </span>
  );
  if (!withTip) return badge;
  return (
    <Tip label={`Risk ${risk.score}, ${RISK_BAND_LABELS[risk.band]}. Show breakdown`} content={<RiskBreakdownTip risk={risk} />}>
      {badge}
    </Tip>
  );
}

// ------------------------------------------------------------------------------------------------ service progress bar
export function ServiceTipContent({ service, label }: { service: ServiceState | undefined; label: string }) {
  const tip = serviceTipLines(service, label);
  return (
    <div className="grid min-w-[220px] gap-1.5">
      <div className="font-medium">{tip.title}</div>
      {tip.lines.map((line) => (
        <div key={line.label} className="flex items-baseline justify-between gap-4">
          <span className="text-[#d6d6d1]">
            {line.label}
            {line.driving ? " (limiting)" : ""}
          </span>
          <span className="mono text-[11px]">{line.text}</span>
        </div>
      ))}
      {tip.footer && <div className="border-t border-white/15 pt-1.5 text-[11px] text-[#a9a9a4]">{tip.footer}</div>}
    </div>
  );
}

/** Mini progress bar for one service. Ticks at 80% (due soon) and 100% (overdue); grey dashed when there is no record. */
export function ServiceBar({ service, label, last, compact }: { service: ServiceState | undefined; label: string; last?: boolean; compact?: boolean }) {
  const status = service?.status;
  const tone = serviceTone(status);
  const t = TONES[tone];
  const measured = service?.usage_pct != null && status !== "no_record" && status !== "not_tracked";
  const fill = usageBarFill(service?.usage_pct);
  const unconfirmed = service?.interval && !service.interval.confirmed;
  return (
    <Tip
      label={`${label}: ${serviceStatusLabel(status)}${measured ? `, ${formatUsage(service?.usage_pct)} used` : ""}. Show details`}
      content={<ServiceTipContent service={service} label={label} />}
      className={cx("block w-full", compact ? "min-w-[64px]" : "min-w-[78px]")}
    >
      <span className="block">
        <span className="mb-1 flex items-baseline justify-between gap-1">
          <span className="text-[11px] font-semibold leading-none" style={{ color: measured ? t.fg : "#77787b" }}>
            {measured ? formatUsage(service?.usage_pct) : "No record"}
          </span>
          {measured && status !== "ok" && (
            <span className="text-[9px] font-bold uppercase leading-none tracking-wide" style={{ color: t.fg }}>
              {status === "overdue" ? "Over" : "Soon"}
            </span>
          )}
        </span>
        <span
          className={cx("relative block h-[7px] w-full overflow-hidden rounded-[2px]", measured ? "bg-[#ecebe7]" : "border border-dashed border-[#c9c8c4] bg-transparent")}
          aria-hidden
        >
          {measured && <span className="absolute inset-y-0 left-0 rounded-[2px] transition-[width] duration-500" style={{ width: `${fill}%`, background: t.solid }} />}
          {measured && <span className="absolute inset-y-0 left-[80%] w-px bg-black/25" />}
          {measured && <span className="absolute inset-y-0 right-0 w-px bg-black/35" />}
        </span>
        {unconfirmed && !last && <span className="sr-only">Interval is a placeholder</span>}
      </span>
    </Tip>
  );
}

export function ServiceLegend() {
  const items: [Tone, string][] = [
    ["ok", "OK"],
    ["soon", "Due soon (80%+)"],
    ["over", "Overdue (100%+)"],
    ["none", "No record"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#77787b]">
      {items.map(([tone, text]) => (
        <span key={text} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cx("h-[7px] w-5 rounded-[2px]", tone === "none" && "border border-dashed border-[#c9c8c4]")} style={tone === "none" ? undefined : { background: TONES[tone].solid }} />
          {text}
        </span>
      ))}
    </div>
  );
}

export function ServiceTypeLabel({ k }: { k: ServiceKey }) {
  return <>{SERVICE_LABELS[k]}</>;
}

// ------------------------------------------------------------------------------------------------ layout bits
export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cx("min-w-0 border border-[#e4e3df] bg-white", className)} {...rest}>
      {children}
    </section>
  );
}

export function SectionHead({ eyebrow, title, aside, info }: { eyebrow?: string; title: string; aside?: ReactNode; info?: string[] }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {eyebrow && <div className="micro mb-1.5 text-[#77787b]">{eyebrow}</div>}
        <h2 className="display-face flex items-center gap-2 text-[22px] font-bold leading-none">
          {title}
          {info && <FormulaTip lines={info} />}
        </h2>
      </div>
      {aside}
    </div>
  );
}

export function SegmentedControl<T extends string>({ value, onChange, options, label, size = "md", className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number; ariaLabel?: string }[]; label: string; size?: "sm" | "md"; className?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cx("inline-flex max-w-full border border-[#d8d7d2] bg-white p-1", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={o.ariaLabel}
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[2px] font-semibold transition-colors",
              size === "sm" ? "h-8 px-3 text-xs!" : "h-9 px-3.5 text-[13px]! md:h-8 md:text-xs!",
              active ? "bg-black text-white" : "text-[#77787b] hover:text-black",
            )}
          >
            {o.label}
            {o.count != null && <span className={cx("mono rounded-[2px] px-1 text-[10px]", active ? "bg-white/20" : "bg-[#f2f2ef]")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Banner({ tone = "soon", icon: Icon = AlertTriangle, children, action, className, testId }: { tone?: "soon" | "over" | "info"; icon?: LucideIcon; children: ReactNode; action?: ReactNode; className?: string; testId?: string }) {
  const palette = tone === "soon" ? "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]" : tone === "over" ? "border-[#f0c4c1] bg-[#fdeeed] text-[#86000B]" : "border-[#cddfd2] bg-[#eef4ef] text-[#33673B]";
  return (
    <div role="status" data-testid={testId} className={cx("flex flex-wrap items-center gap-x-3 gap-y-2 border px-4 py-2.5 text-sm font-medium", palette, className)}>
      <Icon size={16} className="shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action, tone = "none", compact, className }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; tone?: Tone; compact?: boolean; className?: string }) {
  const t = TONES[tone];
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14", className)}>
      <span className="grid h-11 w-11 place-items-center rounded-full border" style={{ color: t.fg, background: t.bg, borderColor: t.border }}>
        <Icon size={19} aria-hidden />
      </span>
      <div className="display-face text-lg font-bold leading-tight">{title}</div>
      {body && <p className="max-w-md text-[13px] leading-5 text-[#77787b]">{body}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function ErrorPanel({ error, onRetry, title = "Could not load this", className }: { error: unknown; onRetry?: () => void; title?: string; className?: string }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div role="alert" className={cx("flex flex-col items-center gap-3 border border-[#f0c4c1] bg-[#fffafa] px-6 py-10 text-center", className)}>
      <span className="grid h-11 w-11 place-items-center rounded-full border border-[#f0c4c1] bg-[#fdeeed] text-[#a32720]">
        <AlertTriangle size={19} aria-hidden />
      </span>
      <div className="display-face text-lg font-bold">{title}</div>
      <p className="max-w-md text-[13px] leading-5 text-[#77787b]">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={btn}>
          <RefreshCw size={14} aria-hidden /> Try again
        </button>
      )}
    </div>
  );
}

export function InlineError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 border border-[#f0c4c1] bg-[#fdeeed] px-3 py-2.5 text-[13px] text-[#86000B]">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

export function Sk({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton rounded-[2px]", className)} />;
}

// ------------------------------------------------------------------------------------------------ KPI tile
const KPI_ACCENT: Record<Tone, string> = { ok: "#1e7b44", soon: "#d89b00", over: "#c4291f", none: "#d8d7d2", info: "#33673B", brand: "#86000B" };

export function KpiTile({ tile, index = 0 }: { tile: KpiTileData; index?: number }) {
  const unknown = tile.reason != null;
  return (
    <div className="entrance relative min-w-0 border border-[#e4e3df] bg-white p-4 md:p-5" style={{ animationDelay: `${index * 50}ms` }} data-testid={`fh-kpi-${tile.key}`}>
      <span aria-hidden className="absolute inset-x-0 top-0 h-[2px]" style={{ background: unknown ? "#e4e3df" : KPI_ACCENT[tile.tone] }} />
      <div className="flex items-start justify-between gap-2">
        <div className="micro min-w-0 text-[#77787b]" style={{ lineHeight: 1.35 }}>
          {tile.label}
        </div>
        <FormulaTip lines={tile.tooltip} label={`How "${tile.label}" is calculated`} />
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className={cx("display-face text-[34px] font-bold leading-none", unknown && "text-[#b9b8b3]")} data-testid={`fh-kpi-value-${tile.key}`}>
          {tile.value}
        </span>
        {tile.unit && <span className="text-xs font-medium text-[#77787b]">{tile.unit}</span>}
      </div>
      <div className="mt-2 text-xs leading-4 text-[#77787b]">{unknown ? tile.reason : tile.detail}</div>
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-busy="true" aria-label="Loading key numbers">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="border border-[#e4e3df] bg-white p-4 md:p-5">
          <Sk className="h-2.5 w-24" />
          <Sk className="mt-4 h-8 w-16" />
          <Sk className="mt-3 h-2.5 w-28" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 7 }: { rows?: number; cols?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="divide-y divide-[#efeeeb]">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="grid items-center gap-4 px-4 py-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
          {Array.from({ length: cols }).map((__, c) => (
            <Sk key={c} className={cx("h-3", c === 0 ? "w-20" : "w-full max-w-[90px]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading chart" className="flex items-end gap-2 px-2" style={{ height }}>
      {[40, 65, 30, 80, 55, 70, 45, 90, 35, 60, 50, 75].map((h, i) => (
        <Sk key={i} className="flex-1" />
      ))}
    </div>
  );
}

/** Labelled value, used in drawers and summary strips. */
export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={cx("min-w-0", className)}>
      <div className="micro text-[#77787b]">{label}</div>
      <div className="mt-1.5 text-[15px] font-semibold leading-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-[#77787b]">{sub}</div>}
    </div>
  );
}

export function Dash({ title }: { title?: string }) {
  return (
    <span title={title} className="text-[#b9b8b3]">
      {EM_DASH}
    </span>
  );
}

export function DateText({ value }: { value: string | null | undefined }) {
  return <>{formatDayMonth(value)}</>;
}

export function PlateText({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("mono font-medium tracking-[.02em]", className)}>{children}</span>;
}

export function MaintainedHeadline({ truck }: { truck: MaintainedTruck }) {
  return <PlateText>{truck.plate}</PlateText>;
}
