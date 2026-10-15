import { ORDER_TYPE_STYLE, normalizeOrderType } from "../../lib/orderType";

export function OrderTypeBadge({ type, className = "" }: { type?: unknown; className?: string }) {
  const t = normalizeOrderType(type);
  const s = ORDER_TYPE_STYLE[t];
  return (
    <span
      className={`inline-flex h-[18px] shrink-0 items-center rounded-[3px] border px-1.5 text-[10px] font-bold leading-none tracking-wide ${s.badge} ${className}`}
      data-testid={`order-type-badge-${t}`}
      title={s.title}
    >
      {s.label}
    </span>
  );
}
