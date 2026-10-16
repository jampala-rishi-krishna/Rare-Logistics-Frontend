import type { ReactNode } from "react";

/**
 * Shared toolbar styling for the Load Planning tabs (Inventory, Load Planning, Confirmed Orders),
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
export function Toolbar({ count, noun = "orders", meta, toggle, filters, secondary, actions, singleRow = false, title, selectedCount = 0, headerActions }: { count: number; noun?: string; meta?: ReactNode; toggle?: ReactNode; filters: ReactNode; secondary?: ReactNode; actions?: ReactNode; singleRow?: boolean; title?: string; selectedCount?: number; headerActions?: ReactNode }) {
  if (title) {
    // Panel layout: header row (title, count, selection), row 1 = primary filters in a grid, row 2 = secondary filters left + action group right.
    return (
      <div className="@container min-w-0 border-b border-[#e4e3df]" data-testid="lp-toolbar">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#efeeeb] px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-sm font-semibold text-[#0b0b0b]">{title}</h2>
            <span className="text-xs text-[#77787b]" data-testid="lp-order-count">
              <span className="mono font-semibold text-black">{count}</span> {count === 1 && noun.endsWith("s") ? noun.slice(0, -1) : noun}
            </span>
            {selectedCount > 0 && (
              <span className="text-xs text-[#55565a]" data-testid="lp-selected-count">
                <span className="mono font-semibold text-black">{selectedCount}</span> selected
              </span>
            )}
            {meta}
          </div>
          {(toggle || headerActions) && (
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2" data-testid="lp-header-actions">
              {toggle}
              {headerActions}
            </div>
          )}
        </div>
        <div className="min-w-0 p-3 sm:p-4">
          <div className="grid min-w-0 grid-cols-1 items-end gap-3 @[520px]:grid-cols-2 @[1000px]:flex @[1000px]:flex-wrap" data-testid="lp-filters">
            {filters}
            {secondary}
            {actions && (
              <div className="flex min-w-0 flex-col items-stretch gap-2 @[520px]:col-span-2 @[520px]:flex-row @[520px]:flex-wrap @[520px]:items-center @[520px]:justify-end @[1000px]:ml-auto [&>*]:w-full @[520px]:[&>*]:w-auto" data-testid="lp-actions">
                {actions}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  // singleRow: filters then actions on ONE aligned row from ~960px of card width (Inventory tab); otherwise the 1240px rule.
  const rowClass = singleRow ? "@[960px]:flex-row @[960px]:items-end @[960px]:justify-between" : "@[1240px]:flex-row @[1240px]:items-end @[1240px]:justify-between";
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
      <div className={`flex min-w-0 flex-col gap-3 sm:gap-4 ${rowClass}`}>
        <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-end [&>*]:w-full sm:[&>*]:w-auto">{filters}</div>
        <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">{actions}</div>
      </div>
    </div>
  );
}

/** The Zoho budget guard is an expected pause, not a failure: shown as a small neutral notice. */
export function isBudgetGuardMessage(message: string) {
  return /budget guard/i.test(message);
}

/** User-facing text for a failed query, with the server's request id when the message doesn't carry it yet. */
export function errorText(error: unknown): string {
  const e = error as { message?: string; requestId?: string | null } | null;
  const message = e?.message || "Something went wrong.";
  return e?.requestId && !message.includes(e.requestId) ? `${message} (Ref: ${e.requestId})` : message;
}

/**
 * Compact inline error / notice in place of the list - only when there is NO data to show (a failed
 * refetch over loaded rows shows ConnectionStatusBar instead). Neutral for the budget guard, red for real errors.
 */
export function ListError({ message, error, onRetry, retrying = false }: { message?: string; error?: unknown; onRetry?: () => void; retrying?: boolean }) {
  const text = message ?? errorText(error);
  const retry = onRetry && (
    <button type="button" onClick={onRetry} disabled={retrying} className="ml-3 inline-flex items-center gap-1 rounded-[4px] border border-current px-2 py-0.5 font-semibold disabled:opacity-60" data-testid="list-error-retry">
      {retrying ? "Retrying…" : "Retry"}
    </button>
  );
  if (isBudgetGuardMessage(text)) {
    return (
      <div role="status" data-testid="list-notice" className="m-3 border border-[#e4e3df] bg-[#f7f7f4] px-3 py-2 text-xs text-[#55565a] sm:mx-4">
        {text}
      </div>
    );
  }
  return (
    <div role="alert" data-testid="list-error" className="m-3 flex flex-wrap items-center justify-between gap-2 border border-[#86000B]/30 bg-[#fff4f4] px-3 py-2 text-xs text-[#86000B] sm:mx-4">
      <span className="min-w-0">{text}</span>
      {retry}
    </div>
  );
}

/** Compact empty state (no tall blank area). */
export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="px-4 py-8 text-center" data-testid="list-empty">
      <div className="text-sm font-semibold text-[#0b0b0b]">{title}</div>
      <div className="mt-1 text-xs text-[#77787b]">{hint}</div>
    </div>
  );
}
