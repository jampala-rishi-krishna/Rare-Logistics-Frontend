import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAccess } from "@/hooks/use-access";
import { api } from "@/services/api/client";
import { refreshTripQueries } from "@/lib/tripRefresh";
import { buttonClass } from "./shared";

export function ReceiveInvoiceButton({
  itemId,
  handedOver,
  status,
}: {
  itemId?: number | null;
  handedOver?: boolean | null;
  status: string;
}) {
  const { user } = useAccess();
  const client = useQueryClient();
  const key = useRef<string | null>(null);
  const receive = useMutation({
    mutationFn: () => {
      key.current ??= crypto.randomUUID();
      return api.post(`/api/driver-overview/invoices/${itemId}/receive`, {
        idempotency_key: key.current,
        client_ts: new Date().toISOString(),
        status: "received",
      });
    },
    onSuccess: () => refreshTripQueries(client),
  });
  if (
    !user ||
    !["admin", "planner", "dispatcher"].includes(user.role) ||
    !itemId ||
    !handedOver ||
    !["with_officer", "missing", "discrepancy"].includes(status)
  )
    return null;
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={() => receive.mutate()}
        disabled={receive.isPending || receive.isSuccess}
      >
        {receive.isPending
          ? "Receiving…"
          : receive.isSuccess
            ? "Received"
            : "Received"}
      </button>
      {receive.isError && (
        <p role="alert" className="max-w-64 text-xs text-destructive">
          {receive.error instanceof Error
            ? receive.error.message
            : "Could not receive invoice. Try again."}
        </p>
      )}
    </div>
  );
}
