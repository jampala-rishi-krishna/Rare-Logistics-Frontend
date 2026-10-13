import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import * as driverApi from "@/services/api/driver";
import { buildHandoverItems, validateHandover } from "@/lib/tripForms";
import type { HandoverRow } from "@/lib/tripForms";
import { browserDraftStore, clearDraft, draftKey, loadDraft, readHandoverDraft, saveDraft } from "@/lib/tripDrafts";
import { actionsEnabled, assignmentPath, timelinePath } from "@/lib/tripNav";
import type { EffectiveBatch } from "@/lib/tripState";
import type { Officer } from "@/lib/tripTypes";
import { useCrewAction, useOfficersQuery } from "./queries";
import { BlockerNote, ErrorState, Skeleton, btnPrimary, btnSecondary, errorText, inputClass } from "./shared";
import type { DriverScope } from "./shared";
import { BatchFrame, InlineAlert, StickyBar, useBatchScreen } from "./subscreen";

type RowState = Record<string, { handed_over: boolean | null; note: string }>;

function HandoverForm({ scope, batchId, state, officers, canSubmit }: { scope: DriverScope; batchId: string; state: EffectiveBatch; officers: Officer[]; canSubmit: boolean }) {
  const actions = useCrewAction(scope, batchId);
  const soIds = state.orders.map((o) => o.so_id);
  const key = draftKey("handover", batchId, null, null);
  const [initial] = useState(() => readHandoverDraft(loadDraft(browserDraftStore(), key), soIds));
  const [rows, setRows] = useState<RowState>(() => {
    const out: RowState = {};
    for (const id of soIds) out[id] = initial?.rows[id] ?? { handed_over: null, note: "" };
    return out;
  });
  const [officerId, setOfficerId] = useState<number | null>(initial?.officer_id ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [errors, setErrors] = useState<{ rows: Record<string, string>; officer: string | null }>({ rows: {}, officer: null });
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    saveDraft(browserDraftStore(), key, { rows, officer_id: officerId, note });
  }, [key, rows, officerId, note]);

  const effectiveOfficer = officerId ?? (officers.length === 1 ? officers[0].id : null);
  const disabled = !canSubmit || actions.busy;
  const patch = (id: string, p: Partial<RowState[string]>) => setRows((r) => ({ ...r, [id]: { ...r[id], ...p } }));

  const submit = async () => {
    setServerError(null);
    const list: HandoverRow[] = soIds.map((id) => ({ so_id: id, handed_over: rows[id]?.handed_over ?? null, note: rows[id]?.note ?? "" }));
    const v = validateHandover(list, effectiveOfficer);
    setErrors({ rows: v.rows, officer: v.officer });
    if (!v.ok) {
      const first = Object.keys(v.rows)[0];
      document.querySelector(first ? `[data-testid="driver-handover-row-${first}"]` : '[data-testid="driver-handover-officer"]')?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const outcome = await actions.run({
      kind: "handover",
      label: "Hand over invoices",
      path: driverApi.paths.handover(batchId),
      extra: { officer_user_id: effectiveOfficer, note: note.trim() || null, items: buildHandoverItems(list) },
      doneMessage: "Handover submitted",
    });
    if (!outcome) return;
    if (outcome.status === "done" || outcome.status === "queued") {
      clearDraft(browserDraftStore(), key);
    } else if (outcome.status === "rejected") {
      setServerError(outcome.info.message);
      const fromServer = outcome.info.errors[0];
      if (fromServer) setErrors((e) => ({ ...e, officer: fromServer.key === "officer_user_id" ? fromServer.message : e.officer }));
    }
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm text-[#55565a]">One line per signed carbon-copy invoice (SO number and the Invoice/DR number you entered when you left the site). Mark each one handed over to the officer; if one was not handed over, add a note.</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setRows((r) => Object.fromEntries(Object.entries(r).map(([id, row]) => [id, { ...row, handed_over: true, note: "" }])))}
        className={btnSecondary}
      >
        Mark all handed over
      </button>
      {serverError && <InlineAlert>{serverError}</InlineAlert>}
      <ul className="grid gap-3">
        {state.orders.map((o) => {
          const row = rows[o.so_id] ?? { handed_over: null, note: "" };
          const err = errors.rows[o.so_id];
          return (
            <li key={o.so_id} className={`border bg-white p-4 ${err ? "border-[#86000B]" : "border-[#e4e3df]"}`} data-testid={`driver-handover-row-${o.so_id}`}>
              <div className="font-mono text-xs font-semibold text-[#77787b]">
                {o.order.so_number}
                <span data-testid={`driver-handover-invoice-${o.order.so_number}`}>{o.order.workflow?.stop?.invoice_no ? ` \u00b7 Invoice/DR ${o.order.workflow.stop.invoice_no}` : " \u00b7 Invoice/DR not recorded"}</span>
              </div>
              <div className="break-words text-base font-bold leading-snug">{o.order.customer_name}</div>
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={`Invoice ${o.order.so_number} handed over`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={row.handed_over === true}
                  disabled={disabled}
                  onClick={() => patch(o.so_id, { handed_over: true, note: "" })}
                  className={`min-h-[56px] border px-3 text-base font-bold ${row.handed_over === true ? "border-black bg-black !text-white" : "border-[#d8d7d2] bg-white"}`}
                >
                  Handed over
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={row.handed_over === false}
                  disabled={disabled}
                  onClick={() => patch(o.so_id, { handed_over: false })}
                  className={`min-h-[56px] border px-3 text-base font-bold ${row.handed_over === false ? "border-[#86000B] bg-[#86000B] text-white" : "border-[#d8d7d2] bg-white"}`}
                >
                  Not handed over
                </button>
              </div>
              {row.handed_over === false && (
                <label className="mt-3 grid gap-1.5 text-sm font-semibold">
                  Note (required)
                  <textarea value={row.note} disabled={disabled} onChange={(e) => patch(o.so_id, { note: e.target.value })} rows={2} placeholder="Why was it not handed over?" className={`${inputClass} py-2 font-normal`} />
                </label>
              )}
              {err && (
                <p role="alert" className="mt-2 text-sm font-semibold text-[#86000B]">
                  {err}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <label className="grid gap-1.5 text-sm font-semibold" data-testid="driver-handover-officer">
        Logistics officer
        <select value={effectiveOfficer ?? ""} disabled={disabled} onChange={(e) => setOfficerId(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
          <option value="">Select officer...</option>
          {officers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {officers.length === 0 && <span className="text-xs font-normal text-[#6b4a00]">No logistics officers are available. Ask dispatch.</span>}
        {errors.officer && (
          <span role="alert" className="text-sm font-semibold text-[#86000B]">
            {errors.officer}
          </span>
        )}
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">
        General note (optional)
        <textarea value={note} disabled={disabled} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputClass} py-2 font-normal`} />
      </label>

      {!scope.isAdmin && (
        <StickyBar>
          {!canSubmit && <BlockerNote text="Handover cannot be submitted right now." />}
          <button type="button" disabled={disabled || !actions.ready} onClick={() => void submit()} data-testid="driver-handover-submit" className={btnPrimary}>
            {actions.busy ? "Submitting..." : "Submit handover"}
          </button>
        </StickyBar>
      )}
    </div>
  );
}

export default function DriverHandover() {
  const { batch_id: batchId } = useParams<{ batch_id: string }>();
  const ctx = useBatchScreen(batchId);
  const officers = useOfficersQuery(ctx.scope);
  const adminId = ctx.scope.adminDriverId;
  const backHref = assignmentPath(batchId, adminId);
  return (
    <BatchFrame ctx={ctx} backHref={backHref} backLabel="Back to assignment" title="Hand over invoices" fullScreen>
      {(batch, state) => {
        const crew = actionsEnabled(ctx.scope, batch);
        if (state.status === "closed") {
          return (
            <div className="grid gap-3" data-testid="driver-handover-closed">
              <p className="border border-[#e4e3df] bg-white p-4 text-base font-bold">Trip closed.</p>
              <Link href={timelinePath(batchId, adminId)} className={btnSecondary}>
                View trip timeline
              </Link>
            </div>
          );
        }
        if (state.status === "handover_submitted") {
          const officer = batch.trip?.officer?.name;
          return (
            <div className="grid gap-3" data-testid="driver-handover-waiting">
              <p className="border border-[#e4e3df] bg-white p-4 text-base font-bold">Handover submitted. Waiting for the logistics officer...</p>
              {officer && <p className="text-sm text-[#55565a]">Officer: {officer}</p>}
              {batch.trip?.handover_status && <p className="text-sm text-[#55565a]">Status: {batch.trip.handover_status.replaceAll("_", " ")}</p>}
              {state.pendingCount > 0 && <p className="text-sm font-semibold text-[#6b4a00]">Pending sync ({state.pendingCount})</p>}
              <Link href={timelinePath(batchId, adminId)} className={btnSecondary}>
                View trip timeline
              </Link>
            </div>
          );
        }
        if (state.status !== "returned") {
          return (
            <div className="grid gap-3">
              <BlockerNote text={batch.trip?.blocker ?? "End the trip before handing over invoices."} />
              <Link href={backHref} className={btnSecondary}>
                Back to assignment
              </Link>
            </div>
          );
        }
        if (officers.isError && !officers.data) return <ErrorState message={errorText(officers.error)} onRetry={() => void officers.refetch()} />;
        if (!officers.data)
          return (
            <div className="grid gap-3" aria-busy="true">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          );
        return (
          <>
            {ctx.scope.isAdmin && (
              <div className="mb-3">
                <BlockerNote text="Admin view is read only. The driver or helper submits the handover." />
              </div>
            )}
            {officers.data.offline && <p className="mb-3 text-xs font-semibold text-[#6b4a00]">Officer list saved on this phone.</p>}
            <HandoverForm scope={ctx.scope} batchId={batchId} state={state} officers={officers.data.data} canSubmit={crew && state.canHandover} />
          </>
        );
      }}
    </BatchFrame>
  );
}
