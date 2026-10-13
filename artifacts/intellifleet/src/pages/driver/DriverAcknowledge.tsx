import { useEffect, useMemo, useState } from "react";
import { OrderTypeBadge } from "@/components/load-planning/OrderTypeBadge";
import { Link, useLocation, useParams } from "wouter";
import * as driverApi from "@/services/api/driver";
import { formatClock, personName } from "@/lib/driver";
import { buildAckAnswers, initialAckForm, isVisible, mapServerErrors, usableItems, validateAck } from "@/lib/tripForms";
import type { AckForm, FieldErrors } from "@/lib/tripForms";
import { browserDraftStore, clearDraft, draftKey, loadDraft, mergeValues, readFormDraft, saveDraft, serializeValues } from "@/lib/tripDrafts";
import { newIdempotencyKey } from "@/lib/tripActions";
import { ackPath, acknowledgeLeft, actionsEnabled, assignmentPath, nextToAcknowledge } from "@/lib/tripNav";
import type { EffectiveBatch, EffectiveOrder } from "@/lib/tripState";
import type { Templates, TemplateItem } from "@/lib/tripTypes";
import { useCrewAction, useTemplatesQuery } from "./queries";
import { BlockerNote, ErrorState, Skeleton, errorText, inputClass, btnPrimary, btnSecondary } from "./shared";
import type { DriverScope } from "./shared";
import { PhotoField } from "./fields";
import { BatchFrame, InlineAlert, StickyBar, useBatchScreen } from "./subscreen";

function AckItem({
  item,
  form,
  error,
  disabled,
  onValue,
  onNote,
}: {
  item: TemplateItem;
  form: AckForm;
  error?: string;
  disabled: boolean;
  onValue: (v: string | boolean | { blob: Blob; filename: string } | null) => void;
  onNote: (v: string) => void;
}) {
  const value = form.values[item.key];
  const text = typeof value === "string" ? value : "";
  const star = item.required ? (
    <span className="ml-1 text-[#86000B]" aria-label="required">
      *
    </span>
  ) : null;
  let control;
  switch (item.item_type) {
    case "checkbox":
      control = (
        <label className={`flex min-h-[56px] items-center gap-3 border px-3 text-base font-semibold ${value === true ? "border-black bg-[#f2f2ef]" : "border-[#d8d7d2] bg-white"}`}>
          <input type="checkbox" checked={value === true} disabled={disabled} onChange={(e) => onValue(e.target.checked)} className="h-6 w-6 shrink-0" />
          <span className="min-w-0 break-words">
            {item.label}
            {star}
          </span>
        </label>
      );
      break;
    case "count":
      control = <input type="text" inputMode="numeric" value={text} disabled={disabled} onChange={(e) => onValue(e.target.value)} placeholder="0" className={inputClass} />;
      break;
    case "photo":
      control = <PhotoField value={value} onChange={(v) => onValue(v as { blob: Blob; filename: string } | null)} label={item.label} />;
      break;
    default:
      control = <textarea value={text} disabled={disabled} onChange={(e) => onValue(e.target.value)} rows={3} className={`${inputClass} py-2`} />;
  }
  const showLabel = item.item_type !== "checkbox";
  const allowNote = item.item_type === "checkbox" || item.item_type === "count";
  return (
    <div className="grid gap-1.5" data-testid={`driver-ack-item-${item.key}`}>
      {showLabel && (
        <div className="text-sm font-semibold">
          {item.label}
          {star}
        </div>
      )}
      {control}
      {allowNote && (
        <details className="text-sm" open={Boolean(form.notes[item.key])}>
          <summary className="min-h-[48px] cursor-pointer py-2.5 font-semibold text-[#55565a]">Add a note</summary>
          <input type="text" value={form.notes[item.key] ?? ""} disabled={disabled} onChange={(e) => onNote(e.target.value)} placeholder="e.g. short by 2 packs" className={inputClass} />
        </details>
      )}
      {error && (
        <p role="alert" className="text-sm font-semibold text-[#86000B]">
          {error}
        </p>
      )}
    </div>
  );
}

function AckBody({
  scope,
  batchId,
  eff,
  state,
  templates,
  canSubmit,
}: {
  scope: DriverScope;
  batchId: string;
  eff: EffectiveOrder;
  state: EffectiveBatch;
  templates: Templates;
  canSubmit: boolean;
}) {
  const [, setLocation] = useLocation();
  const actions = useCrewAction(scope, batchId);
  const template = templates.acknowledge_checklist;
  const items = useMemo(() => usableItems(template.items, templates.photo_storage_enabled), [template, templates.photo_storage_enabled]);
  const key = draftKey("ack", batchId, eff.so_id, template.id);
  const [form, setForm] = useState<AckForm>(() => {
    const base = initialAckForm(items);
    const draft = readFormDraft(loadDraft(browserDraftStore(), key));
    if (!draft) return base;
    return { values: mergeValues(base.values, draft.values), notes: draft.notes ?? {}, general_note: draft.general_note ?? "" };
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    saveDraft(browserDraftStore(), key, { values: serializeValues(form.values), notes: form.notes, general_note: form.general_note });
  }, [key, form]);

  const left = acknowledgeLeft(state.orders);
  const position = state.orders.findIndex((o) => o.so_id === eff.so_id) + 1;
  const disabled = !canSubmit || actions.busy;
  const visible = items.filter((i) => isVisible(i, items, form.values));

  const submit = async () => {
    setServerError(null);
    setGeneral([]);
    const errs = validateAck(items, form.values);
    setErrors(errs);
    const firstBad = Object.keys(errs)[0];
    if (firstBad) {
      document.querySelector(`[data-testid="driver-ack-item-${firstBad}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const built = buildAckAnswers(form, items, newIdempotencyKey);
    const outcome = await actions.run({
      kind: "acknowledge",
      so_id: eff.so_id,
      label: `Acknowledge ${eff.order.so_number}`,
      path: driverApi.paths.acknowledge(batchId, eff.so_id),
      extra: { template_id: template.id, answers: built.answers, discrepancy_note: built.discrepancy_note },
      blobs: built.blobs,
      doneMessage: `${eff.order.so_number} acknowledged`,
    });
    if (!outcome) return;
    if (outcome.status === "done" || outcome.status === "queued") {
      clearDraft(browserDraftStore(), key);
      const next = nextToAcknowledge(state.orders, eff.so_id);
      setLocation(next ? ackPath(batchId, next, scope.adminDriverId) : assignmentPath(batchId, scope.adminDriverId));
      return;
    }
    if (outcome.status === "rejected") {
      const mapped = mapServerErrors(outcome.info.errors, items);
      setErrors(mapped.fields);
      setGeneral(mapped.general);
      setServerError(outcome.info.message);
    }
  };

  const nextId = nextToAcknowledge(state.orders, eff.so_id);
  return (
    <div className="grid gap-4">
      <section className="border border-[#e4e3df] bg-white p-4">
        <div className="font-mono text-xs font-semibold text-[#77787b]">
          <OrderTypeBadge type={eff.order.order_type} className="mr-1.5 align-middle" />
          {eff.order.so_number}
          {position > 0 ? ` · order ${position} of ${state.orders.length}` : ""}
        </div>
        <h2 className="mt-1 break-words text-lg font-bold leading-snug">{eff.order.customer_name}</h2>
        {left > 0 && <p className="mt-2 text-sm font-semibold text-[#6b4a00]">{left} {left === 1 ? "order" : "orders"} left to acknowledge</p>}
      </section>

      {serverError && <InlineAlert>{serverError}</InlineAlert>}
      {general.map((g, i) => (
        <InlineAlert key={i}>{g}</InlineAlert>
      ))}
      {Object.keys(errors).length > 0 && !serverError && <InlineAlert>Complete the highlighted items to continue.</InlineAlert>}

      {visible.length === 0 && <p className="text-sm text-[#55565a]">Nothing to check for this order. Confirm to acknowledge it.</p>}
      {visible.map((item) => (
        <AckItem
          key={item.key}
          item={item}
          form={form}
          error={errors[item.key]}
          disabled={disabled}
          onValue={(v) => setForm((f) => ({ ...f, values: { ...f.values, [item.key]: v } }))}
          onNote={(v) => setForm((f) => ({ ...f, notes: { ...f.notes, [item.key]: v } }))}
        />
      ))}

      <label className="grid gap-1.5 text-sm font-semibold">
        Discrepancy note (optional)
        <textarea
          value={form.general_note}
          disabled={disabled}
          onChange={(e) => setForm((f) => ({ ...f, general_note: e.target.value }))}
          rows={3}
          placeholder="Anything that does not match the order"
          className={`${inputClass} py-2 font-normal`}
        />
      </label>

      {!scope.isAdmin && (
        <StickyBar>
          {!canSubmit && <BlockerNote text={eff.blocker ?? "This order cannot be acknowledged right now."} />}
          <button type="button" disabled={disabled || !actions.ready} onClick={() => void submit()} data-testid="driver-ack-submit" className={btnPrimary}>
            {actions.busy ? "Saving..." : nextId ? "Acknowledge and go to next order" : "Acknowledge"}
          </button>
        </StickyBar>
      )}
    </div>
  );
}

export default function DriverAcknowledge() {
  const { batch_id: batchId, so_id: soId } = useParams<{ batch_id: string; so_id: string }>();
  const ctx = useBatchScreen(batchId);
  const templates = useTemplatesQuery(ctx.scope);
  const backHref = assignmentPath(batchId, ctx.scope.adminDriverId);
  return (
    <BatchFrame ctx={ctx} backHref={backHref} backLabel="Back to assignment" title="Acknowledge order" fullScreen>
      {(batch, state) => {
        const eff = state.orders.find((o) => o.so_id === soId);
        if (!eff) return <InlineAlert tone="warn">This order is not part of this assignment.</InlineAlert>;
        const ack = eff.order.workflow?.ack ?? null;
        if (ack || eff.ackPending) {
          return (
            <div className="grid gap-3" data-testid="driver-ack-done">
              <p className="border border-[#e4e3df] bg-white p-4 text-sm font-semibold">
                {eff.order.so_number} is acknowledged{ack ? ` by ${personName(ack.by) || "the crew"}${ack.at ? ` at ${formatClock(ack.at)}` : ""}` : " (waiting to sync)"}.
              </p>
              {nextToAcknowledge(state.orders, eff.so_id) && !ctx.scope.isAdmin && (
                <Link href={ackPath(batchId, nextToAcknowledge(state.orders, eff.so_id) as string, ctx.scope.adminDriverId)} className={btnPrimary}>
                  Next order to acknowledge
                </Link>
              )}
              <Link href={backHref} className={btnSecondary}>
                Back to assignment
              </Link>
            </div>
          );
        }
        if (templates.isError && !templates.data) return <ErrorState message={errorText(templates.error)} onRetry={() => void templates.refetch()} />;
        if (!templates.data)
          return (
            <div className="grid gap-3" aria-busy="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          );
        const canSubmit = actionsEnabled(ctx.scope, batch) && eff.canAcknowledge;
        return (
          <>
            {ctx.scope.isAdmin && <div className="mb-3"><BlockerNote text="Admin view is read only. The driver or helper acknowledges orders." /></div>}
            {templates.data.offline && <p className="mb-3 text-xs font-semibold text-[#6b4a00]">Using the checklist saved on this phone.</p>}
            <AckBody key={eff.so_id} scope={ctx.scope} batchId={batchId} eff={eff} state={state} templates={templates.data.data} canSubmit={canSubmit} />
          </>
        );
      }}
    </BatchFrame>
  );
}
