import { statusLabelWithTime, statusStyle } from "@/lib/statusColors";

/** Order / delivery status chip: text + colour from src/lib/statusColors.ts, with the helper-app check-out time
 *  (Manila) next to Delivered / Partially delivered / Not delivered / Fulfilled, e.g. "Delivered · 10:31". */
export function OrderStatusChip({ status, checkoutAt, small = false, title }: { status: string | null | undefined; checkoutAt?: string | null; small?: boolean; title?: string }) {
  const s = statusStyle(status);
  return (
    <span
      data-testid={`order-status-${s.label.toLowerCase().replaceAll(" ", "-")}`}
      data-tone={s.tone}
      title={title}
      className={`status-chip ${s.className}`}
      style={small ? { padding: "2px 8px", fontSize: 10 } : undefined}
    >
      {statusLabelWithTime(status, checkoutAt)}
    </span>
  );
}
