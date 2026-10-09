import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, MailX, RefreshCw, Send } from "lucide-react";
import * as inventoryApi from "@/services/api/inventory";

/** Small status pill for the assignment email: shows what Gmail actually did, never a guess. */
export function EmailStatusChip({
  status,
  error,
  onRetry,
  retrying = false,
}: {
  status?: string | null;
  error?: string | null;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  if (!status) return null;
  const style: Record<string, string> = {
    sent: "border-[#33673B]/30 bg-[#f1f8f2] text-[#33673B]",
    queued: "border-[#d8d7d2] bg-[#f7f7f4] text-[#55565a]",
    failed: "border-[#86000B]/30 bg-[#fff4f4] text-[#86000B]",
    skipped: "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]",
  };
  const label: Record<string, string> = { sent: "Email sent", queued: "Email sending…", failed: "Email failed", skipped: "Email skipped" };
  return (
    <span className="mt-1 inline-flex flex-wrap items-center gap-1">
      <span title={error || undefined} className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-semibold ${style[status] || style.queued}`}>
        {status === "queued" && <Loader2 size={10} className="animate-spin" />}
        {label[status] || status}
      </span>
      {status === "failed" && onRetry && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
          disabled={retrying}
          className="inline-flex items-center gap-1 border border-[#86000B]/40 px-1.5 py-0.5 text-[10px] font-semibold text-[#86000B] disabled:opacity-50"
        >
          <RefreshCw size={10} className={retrying ? "animate-spin" : ""} /> Retry
        </button>
      )}
    </span>
  );
}

/** Shown right after an assignment: the email is sent automatically; this is its real outcome. */
export function AssignmentEmailStatusPanel({
  salesOrderIds,
  vehicleId,
  driverIds,
  manualVehicle,
  assignmentBatchId,
  onEdit,
}: {
  salesOrderIds: string[];
  vehicleId: string;
  driverIds: number[];
  manualVehicle?: inventoryApi.ManualVehicleInput;
  assignmentBatchId?: string | null;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const key = ["assignment-email-status", salesOrderIds.join(",")];
  const status = useQuery({
    queryKey: key,
    queryFn: () => inventoryApi.getAssignmentEmailStatus(salesOrderIds),
    refetchInterval: (query) => {
      const state = query.state.data?.status;
      return !state || state === "queued" ? 1500 : false; // poll only until Gmail has answered
    },
    retry: false,
  });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");
  const current = status.data?.status ?? null;
  const retry = async () => {
    setRetrying(true);
    setRetryError("");
    try {
      await inventoryApi.sendAssignmentEmail(salesOrderIds, vehicleId, driverIds, { emailOnly: true, manualVehicle, assignmentBatchId });
      await queryClient.invalidateQueries({ queryKey: key });
    } catch (e: any) {
      setRetryError(e?.message || "Retry failed.");
    } finally {
      setRetrying(false);
    }
  };
  const tone =
    current === "failed"
      ? "border-[#86000B]/30 bg-[#fff4f4] text-[#86000B]"
      : current === "sent"
        ? "border-[#33673B]/30 bg-[#f1f8f2] text-[#33673B]"
        : current === "skipped"
          ? "border-[#e6c36a] bg-[#fff6dd] text-[#6b4a00]"
          : "border-[#d8d7d2] bg-[#f7f7f4] text-[#55565a]";
  return (
    <section role="status" data-testid="assignment-email-status" className={`mt-4 flex flex-wrap items-center justify-between gap-3 border px-4 py-3 text-sm ${tone}`}>
      <div className="flex items-start gap-2">
        {current === "sent" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : current === "failed" ? <MailX size={16} className="mt-0.5 shrink-0" /> : current === "skipped" ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin" />}
        <div>
          <div className="font-semibold">
            {current === "sent" && "Email sent"}
            {current === "failed" && "Email failed"}
            {current === "skipped" && "Email skipped"}
            {(current === "queued" || !current) && "Sending assignment email…"}
          </div>
          {status.data?.error && <div className="mt-0.5 text-xs">{current === "failed" ? `Email failed: ${status.data.error}` : status.data.error}</div>}
          {retryError && <div className="mt-0.5 text-xs">{retryError}</div>}
        </div>
      </div>
      <div className="flex gap-2">
        {current === "failed" && (
          <button type="button" onClick={retry} disabled={retrying} className="inline-flex items-center gap-1.5 border border-current px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
            <RefreshCw size={13} className={retrying ? "animate-spin" : ""} /> Retry
          </button>
        )}
        <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 border border-[#d8d7d2] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b0b0b]">
          <Send size={13} /> Resend / edit email
        </button>
      </div>
    </section>
  );
}
