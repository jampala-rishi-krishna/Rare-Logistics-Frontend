// ONE filter bar for the whole page: [◀ date ▶] [Today] [Range] [Warehouse] [search]. Date + warehouse + search drive the
// tiles, the Trips list and Export; Invoices and Issues use warehouse + search (date only with "Only this date").
import { useEffect, useState } from "react";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { dayLabel, isRange, rangeError, shiftDay } from "@/lib/overviewModel";
import type { UrlState } from "@/lib/overviewModel";
import { buttonClass, focusRing, iconButtonClass, inputClass } from "./shared";

export default function FilterBar({
  state,
  set,
  today,
}: {
  state: UrlState;
  set: (p: Partial<UrlState>, o?: { replace?: boolean }) => void;
  today: string;
}) {
  const range = isRange(state);
  const [text, setText] = useState(state.q);
  // URL -> box when the query changes from outside (Back, Clear filters, a link)
  useEffect(() => {
    setText(state.q);
  }, [state.q]);
  // box -> URL, debounced, without a history entry per keystroke
  useEffect(() => {
    if (text === state.q) {
      return;
    }
    const t = window.setTimeout(() => {
      set({ q: text }, { replace: true });
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const err = range ? rangeError(state.from, state.to) : null;
  const label = "grid gap-0.5 text-[12px] font-medium text-muted-foreground";
  return (
    <div
      role="search"
      aria-label="Filters"
      data-testid="filter-bar"
      className="flex flex-wrap items-end gap-2"
    >
      {range ? (
        <div
          className="flex flex-wrap items-end gap-2"
          data-testid="range-inputs"
        >
          <label className={label}>
            From
            <input
              type="date"
              value={state.from}
              max={state.to}
              onChange={(e) => e.target.value && set({ from: e.target.value })}
              className={inputClass}
              data-testid="range-from"
            />
          </label>
          <label className={label}>
            To
            <input
              type="date"
              value={state.to}
              min={state.from}
              onChange={(e) => e.target.value && set({ to: e.target.value })}
              className={inputClass}
              data-testid="range-to"
            />
          </label>
        </div>
      ) : (
        <div className="flex items-end gap-1">
          <button
            type="button"
            aria-label="Previous day"
            onClick={() => set({ date: shiftDay(state.date, -1) })}
            className={iconButtonClass}
            data-testid="day-prev"
          >
            <ChevronLeft size={16} />
          </button>
          <label className={label}>
            <span>
              Date <span className="sr-only">(Manila)</span>
            </span>
            <input
              type="date"
              value={state.date}
              onChange={(e) => e.target.value && set({ date: e.target.value })}
              className={`${inputClass} w-[150px]`}
              aria-label={`Date, ${dayLabel(state.date)}`}
              data-testid="day-input"
            />
          </label>
          <button
            type="button"
            aria-label="Next day"
            onClick={() => set({ date: shiftDay(state.date, 1) })}
            className={iconButtonClass}
            data-testid="day-next"
          >
            <ChevronRight size={16} />
          </button>
          <button
            type="button"
            onClick={() => set({ date: today })}
            disabled={state.date === today}
            className={buttonClass}
            data-testid="day-today"
          >
            Today
          </button>
        </div>
      )}
      <button
        type="button"
        aria-pressed={range}
        onClick={() =>
          range
            ? set({ from: "", to: "", date: state.to || today })
            : set({ from: shiftDay(state.date, -6), to: state.date })
        }
        className={`${buttonClass} ${range ? "border-foreground bg-muted" : ""}`}
        data-testid="range-toggle"
      >
        <CalendarRange size={14} aria-hidden />
        Range
      </button>
      <label className={label}>
        <span className="sr-only">Warehouse</span>
        <select
          value={state.wh}
          onChange={(e) => set({ wh: e.target.value })}
          className={`${inputClass} pr-7`}
          data-testid="warehouse"
          aria-label="Warehouse"
        >
          <option value="">Warehouse: All</option>
          <option value="METS">Warehouse: METS</option>
          <option value="GLACIER">Warehouse: GLACIER</option>
        </select>
      </label>
      <label className="relative min-w-[200px] flex-[1_1_240px]">
        <span className="sr-only">
          Search driver, truck, SO, invoice or customer
        </span>
        <Search
          size={14}
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Driver, truck, SO, invoice…"
          className={`${inputClass} w-full pl-8 pr-8 placeholder:text-muted-foreground`}
          data-testid="search"
        />
        {text && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setText("")}
            className={`absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[4px] text-muted-foreground hover:text-foreground ${focusRing}`}
          >
            <X size={14} />
          </button>
        )}
      </label>
      {err && (
        <p
          role="alert"
          className="basis-full text-[12px] font-semibold text-destructive"
          data-testid="range-error"
        >
          {err}
        </p>
      )}
    </div>
  );
}
