import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import * as driverApi from "@/services/api/driver";
import { formatClock, personName } from "@/lib/driver";
import { buildCheckoutAnswers, initialCheckoutForm, isItemRequired, isItemVisible, mapServerErrors, usableItems, validateCheckout } from "@/lib/tripForms";
import type { FieldErrors, FormValue, FormValues } from "@/lib/tripForms";
import { browserDraftStore, clearDraft, draftKey, loadDraft, mergeValues, readFormDraft, saveDraft, serializeValues } from "@/lib/tripDrafts";
import { newIdempotencyKey } from "@/lib/tripActions";
import { actionsEnabled, assignmentPath, checkinNotice } from "@/lib/tripNav";
import type { EffectiveOrder } from "@/lib/tripState";
import type { Templates } from "@/lib/tripTypes";
import { useCrewAction, useTemplatesQuery } from "./queries";
import { BlockerNote, ErrorState, Skeleton, btnPrimary, btnSecondary, errorText } from "./shared";
import type { DriverScope } from "./shared";
import { CheckoutField } from "./fields";
import { BatchFrame, InlineAlert, StickyBar, useBatchScreen, useTripActions } from "./subscreen";

function CheckoutBody({ scope, batchId, eff, templates, canSubmit }: { scope: DriverScope; batchId: string; eff: EffectiveOrder; templates: Templates; canSubmit: boolean }) {
  const [, setLocation] = useLocation();
  const actions = useCrewAction(scope, batchId);
  const template = templates.delivery_checkout;
  const items = useMemo(() => usableItems(template.items, templates.photo_storage_enabled), [template, templates.photo_storage_enabled]);
  const initial = useMemo(() => initialCheckoutForm(items, eff.order), [items, eff.order]);
  const key = draftKey("checkout", batchId, eff.so_id, template.id);
  const [values, setValues] = useState<FormValues>(() => {
    const draft = readFormDraft(loadDraft(browserDraftStore(), key));
    return draft ? mergeValues(initial.values, draft.values, initial.locked) : initial.values;
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [general, setGeneral] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    saveDraft(browserDraftStore(), key, { values: serializeValues(values) });
  }, [key, values]);

  const disabled = !canSubmit || actions.busy;
  const visible = items.filter((i) => isItemVisible(i, items, values));
  const set = (k: string, v: FormValue) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => {
      if (!(k in prev)) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  };

  const submit = async () => {
    setServerError(null);
    setGeneral([]);
    const errs = validateCheckout(items, values);
    setErrors(errs);
    const firstBad = Object.keys(errs)[0];
    if (firstBad) {
      document.querySelector(`[data-testid="driver-field-${firstBad}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    const built = buildCheckoutAnswers(items, values, newIdempotencyKey);
    const outcome = await actions.run({
      kind: "check_out",
      so_id: eff.so_id,
      label: `Check out ${eff.order.so_number}`,
      path: driverApi.paths.checkOut(batchId, eff.so_id),
      extra: { template_id: template.id, answers: built.answers },
      blobs: built.blobs,
      doneMessage: `${eff.order.so_number} checked out`,
    });
    if (!outcome) return;
    if (outcome.status === "done" || outcome.status === "queued") {
      clearDraft(browserDraftStore(), key);
      setLocation(assignmentPath(batchId, scope.adminDriverId));
      return;
    }
    if (outcome.status === "rejected") {
      const mapped = mapServerErrors(outcome.info.errors, items);
      setErrors(mapped.fields);
      setGeneral(mapped.general);
      setServerError(outcome.info.message);
    }
  };

  const stop = eff.order.workflow?.stop ?? null;
  const notice = checkinNotice(stop);
  return (
    <div className="grid gap-4">
      <section className="border border-[#e4e3df] bg-white p-4">
        <div className="font-mono text-xs font-semibold text-[#77787b]">
          {stop ? `Stop ${stop.sequence} · ` : ""}
          {eff.order.so_number}
        </div>
        <h2 className="mt-1 break-words text-lg font-bold leading-snug">{eff.order.customer_name}</h2>
        {eff.order.address_text && <p className="mt-1 break-words text-sm text-[#55565a]">{eff.order.address_text}</p>}
        {notice?.far && <div className="mt-2 border-l-2 border-[#a16819] bg-[#fff8ec] p-3 text-sm font-semibold text-[#6b4a00]">{notice.text}</div>}
      </section>

      {serverError && <InlineAlert>{serverError}</InlineAlert>}
      {general.map((g, i) => (
        <InlineAlert key={i}>{g}</InlineAlert>
      ))}
      {Object.keys(errors).length > 0 && !serverError && <InlineAlert>Complete the highlighted fields to continue.</InlineAlert>}

      {visible.map((item) => (
        <CheckoutField
          key={item.key}
          item={item}
          value={values[item.key]}
          onChange={(v) => set(item.key, v)}
          required={isItemRequired(item, items, values)}
          error={errors[item.key]}
          locked={initial.locked.has(item.key)}
        />
      ))}
      <p className="text-xs text-[#77787b]">Typed answers are kept if you leave this screen. Photos and signatures must be taken again.</p>

      {!scope.isAdmin && (
        <StickyBar>
          {!canSubmit && <BlockerNote text={eff.blocker ?? "This order cannot be checked out right now."} />}
          <button type="button" disabled={disabled || !actions.ready} onClick={() => void submit()} data-testid="driver-checkout-submit" className={btnPrimary}>
            {actions.busy ? "Saving..." : "Submit delivery"}
          </button>
        </StickyBar>
      )}
    </div>
  );
}

export default function DriverCheckout() {
  const { batch_id: batchId, so_id: soId } = useParams<{ batch_id: string; so_id: string }>();
  const ctx = useBatchScreen(batchId);
  const templates = useTemplatesQuery(ctx.scope);
  const trip = useTripActions(ctx.scope, batchId ?? "");
  const backHref = assignmentPath(batchId, ctx.scope.adminDriverId);
  return (
    <BatchFrame ctx={ctx} backHref={backHref} backLabel="Back to assignment" title="Delivery check-out" fullScreen>
      {(batch, state) => {
        const eff = state.orders.find((o) => o.so_id === soId);
        if (!eff) return <InlineAlert tone="warn">This order is not part of this assignment.</InlineAlert>;
        const crew = actionsEnabled(ctx.scope, batch);
        const stop = eff.order.workflow?.stop ?? null;
        if (eff.stopStatus === "checked_out") {
          return (
            <div className="grid gap-3" data-testid="driver-checkout-done">
              <p className="border border-[#e4e3df] bg-white p-4 text-sm font-semibold">
                {eff.order.so_number} is checked out{eff.outcome ? ` (${eff.outcome})` : ""}
                {stop?.checkout_at ? ` by ${personName(stop.checkout_by) || "the crew"} at ${formatClock(stop.checkout_at)}` : eff.stopPending ? " (waiting to sync)" : ""}.
              </p>
              <Link href={backHref} className={btnSecondary}>
                Back to assignment
              </Link>
            </div>
          );
        }
        if (crew && !eff.canCheckOut && eff.canCheckIn) {
          return (
            <div className="grid gap-3">
              <BlockerNote text={eff.blocker ?? "Check in at this stop first."} />
              <button type="button" disabled={trip.busy} onClick={() => void trip.checkIn(eff.so_id, eff.order.so_number)} data-testid="driver-arrived-here" className={btnPrimary}>
                {trip.capturing ? "Getting location..." : "Arrived"}
              </button>
            </div>
          );
        }
        if (templates.isError && !templates.data) return <ErrorState message={errorText(templates.error)} onRetry={() => void templates.refetch()} />;
        if (!templates.data)
          return (
            <div className="grid gap-3" aria-busy="true">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          );
        const canSubmit = crew && eff.canCheckOut;
        return (
          <>
            {ctx.scope.isAdmin && (
              <div className="mb-3">
                <BlockerNote text="Admin view is read only. The driver or helper checks out orders." />
              </div>
            )}
            {templates.data.offline && <p className="mb-3 text-xs font-semibold text-[#6b4a00]">Using the form saved on this phone.</p>}
            <CheckoutBody key={eff.so_id} scope={ctx.scope} batchId={batchId} eff={eff} templates={templates.data.data} canSubmit={canSubmit} />
          </>
        );
      }}
    </BatchFrame>
  );
}
