import { Loader2 } from "lucide-react";
import { blockedLine, confirmLine, dialogTitle, proceedLabel, type UnassignPlan } from "@/lib/unassignConfirm";
import { buttonClass, dangerButtonClass } from "./ToolbarControls";

type DialogPlan = Extract<UnassignPlan, { kind: "dialog" }>;

/** One confirmation for single and bulk unassign: orders already acknowledged / started / checked in (need confirm)
 * and orders that can't be unassigned (delivered / checked out, excluded). Same look as the bulk-unassign dialog. */
export default function UnassignConfirmDialog({
  plan,
  busy,
  onCancel,
  onConfirm,
}: {
  plan: DialogPlan;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const go = proceedLabel(plan);
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-4" onClick={() => !busy && onCancel()}>
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unassign-confirm-title"
        className="w-full max-w-md border border-[#e4e3df] bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        data-testid="unassign-confirm-dialog"
      >
        <h2 id="unassign-confirm-title" className="text-lg font-bold">
          {dialogTitle(plan)}
        </h2>
        {plan.confirmRows.length > 0 && (
          <>
            <p className="mt-2 text-xs text-[#77787b]">The crew has already started on {plan.confirmRows.length === 1 ? "this order" : "these orders"}. Unassigning removes {plan.confirmRows.length === 1 ? "it" : "them"} from the driver's trip.</p>
            <ul className="mt-2 grid max-h-56 gap-1 overflow-y-auto text-sm" data-testid="unassign-confirm-list">
              {plan.confirmRows.map((row) => (
                <li key={row.id} className="border-l-2 border-[#a16819] pl-2">
                  {confirmLine(row)}
                </li>
              ))}
            </ul>
          </>
        )}
        {plan.blockedRows.length > 0 && (
          <ul className="mt-3 grid max-h-40 gap-1 overflow-y-auto text-sm text-[#86000B]" data-testid="unassign-blocked-list">
            {plan.blockedRows.map((row) => (
              <li key={row.id} className="border-l-2 border-[#86000B] pl-2">
                {blockedLine(row)}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={buttonClass}>
            {go ? "Cancel" : "Close"}
          </button>
          {go && (
            <button type="button" onClick={onConfirm} disabled={busy} className={dangerButtonClass} data-testid="unassign-confirm-go">
              {busy && <Loader2 size={14} className="animate-spin" />} {go}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
