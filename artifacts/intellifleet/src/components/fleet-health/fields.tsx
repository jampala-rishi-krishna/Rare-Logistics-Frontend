import { useId, type ReactNode } from "react";
import { cx } from "./ui";

/** Label + control + hint/error. Pass the generated id to the control via the render prop. */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
  optional,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  optional?: boolean;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  const hasMsg = Boolean(error || hint);
  return (
    <div className={cx("grid min-w-0 gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[13px] font-semibold leading-none text-[#0b0b0b]">
        {label}
        {required && (
          <span aria-hidden className="text-[#a32720]">
            *
          </span>
        )}
        {optional && <span className="text-[11px] font-normal text-[#77787b]">optional</span>}
      </label>
      {children(id, hasMsg ? msgId : undefined)}
      {hasMsg && (
        <div id={msgId} className={cx("text-xs leading-4", error ? "text-[#a32720]" : "text-[#77787b]")}>
          {error || hint}
        </div>
      )}
    </div>
  );
}

/** Generic radio-style segmented choice with big tap targets. */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; tone?: "ok" | "over" | "none" | "soon" }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("grid auto-cols-fr grid-flow-col overflow-hidden rounded-[4px] border border-[#d8d7d2] bg-white", className)}>
      {options.map((o, i) => {
        const active = value === o.value;
        const palette =
          o.tone === "ok" ? "bg-[#1e7b44] text-white" : o.tone === "over" ? "bg-[#a32720] text-white" : o.tone === "soon" ? "bg-[#d89b00] text-white" : "bg-[#0b0b0b] text-white";
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "h-11 px-2 text-[13px]! font-semibold leading-none! transition-colors md:h-9",
              i > 0 && "border-l border-[#d8d7d2]",
              active ? palette : "bg-white text-[#55565a] hover:bg-[#f2f2ef]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FormSection({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx("grid gap-4", className)}>
      {title && <div className="micro border-b border-[#e4e3df] pb-2 text-[#77787b]">{title}</div>}
      {children}
    </div>
  );
}

/** Native checkbox-as-switch row with a 44px tap target. */
export function ToggleRow({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3 border border-[#d8d7d2] bg-white px-3 py-2">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#0b0b0b]" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-[#77787b]">{hint}</span>}
      </span>
    </label>
  );
}
