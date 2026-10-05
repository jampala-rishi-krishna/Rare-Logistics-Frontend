import type { ReactNode } from "react";

/**
 * Shared toolbar styling for the Load Planning tabs (Inventory, Load Planning, Confirmed SO),
 * so every control has the same height, font size, radius and border colour.
 */
export const CONTROL_HEIGHT = "h-9"; // 36px
const CONTROL_BASE = `${CONTROL_HEIGHT} rounded-[4px] border border-[#d8d7d2] text-sm! leading-none!`;
export const inputClass = `${CONTROL_BASE} min-w-0 bg-white px-2.5 text-black outline-none focus:border-[#0b0b0b]`;
export const buttonClass = `${CONTROL_BASE} inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap bg-white px-3 disabled:opacity-60`;
export const primaryButtonClass = `${CONTROL_HEIGHT} inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[4px] border border-[#0b0b0b] bg-[#0b0b0b] px-3 text-sm! leading-none! text-white disabled:opacity-60`;
export const dangerButtonClass = `${buttonClass} !border-[#86000B] text-[#86000B]`;

// NB: index.css has an unlayered `button, input, select { font: inherit }` that beats Tailwind's
// layered text-size utilities, so the font size here is forced with the important modifier.

/** A filter control with its 12px muted label above it; all labels look and sit the same. */
export function FilterField({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={`grid min-w-0 gap-1 ${className}`}>
      <span className="text-xs font-semibold leading-none text-[#77787b]">{label}</span>
      {children}
    </label>
  );
}

/**
 * Two-row toolbar. Row 1: count on the left, optional view toggle on the right. Row 2: filters on
 * the left, actions on the right, bottom-aligned. At <1200px the actions drop below the filters (right-aligned) when the card is narrower than 1240px;
 * at <640px every control goes full width.
 */
export function Toolbar({ count, noun = "orders", meta, toggle, filters, actions }: { count: number; noun?: string; meta?: ReactNode; toggle?: ReactNode; filters: ReactNode; actions: ReactNode }) {
  return (
    <div className="@container grid min-w-0 gap-3 border-b border-[#e4e3df] p-3 sm:p-4" data-testid="lp-toolbar">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[13px] text-[#77787b]" data-testid="lp-order-count">
            <span className="mono font-semibold text-black">{count}</span> {noun}
          </span>
          {meta}
        </div>
        {toggle}
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:gap-4 @[1240px]:flex-row @[1240px]:items-end @[1240px]:justify-between">
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-end [&>*]:w-full sm:[&>*]:w-auto">{filters}</div>
        <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">{actions}</div>
      </div>
    </div>
  );
}
