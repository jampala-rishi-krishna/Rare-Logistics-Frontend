import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw } from "lucide-react";
import * as fh from "@/services/api/fleetHealth";
import type { IntervalPair, MaintainedTruck, ServiceKey, ServiceIntervalRow } from "@/services/api/fleetHealth";
import { SERVICE_LONG_LABELS, SERVICE_ORDER, intervalBody, intervalRowEquals, intervalRowError, intervalRowFrom, type IntervalFormRow } from "@/lib/fleetHealth";
import { Modal } from "./Modal";
import { Pill, btn, btnGhost, btnPrimary, cx, fieldClass, InlineError } from "./ui";
import { errorMessage, invalidateFleetHealth } from "./hooks";

interface Block {
  /** original server row (null = not set) */
  original: ServiceIntervalRow | null;
  originalForm: IntervalFormRow;
  form: IntervalFormRow;
  confirmedAsIs: boolean;
  reset: boolean;
}

interface Line {
  key: ServiceKey;
  def: Block;
  over: Block | null;
}

const emptyBlock = (): Block => ({ original: null, originalForm: { km: "", hours: "", days: "" }, form: { km: "", hours: "", days: "" }, confirmedAsIs: false, reset: false });

function blockFrom(row: ServiceIntervalRow | null): Block {
  const f = row ? intervalRowFrom(row.interval_km, row.interval_engine_hours, row.interval_days) : { km: "", hours: "", days: "" };
  return { original: row, originalForm: f, form: { ...f }, confirmedAsIs: false, reset: false };
}

const isDirty = (b: Block) => b.reset || b.confirmedAsIs || !intervalRowEquals(b.form, b.originalForm);

/** Build the fleet-default rows from the trucks list when no truck detail is at hand (the /trucks payload has values but no ids). */
function defaultsFromTrucks(trucks: MaintainedTruck[]): Partial<Record<ServiceKey, ServiceIntervalRow>> {
  const out: Partial<Record<ServiceKey, ServiceIntervalRow>> = {};
  for (const key of SERVICE_ORDER) {
    for (const t of trucks) {
      const iv = t.services[key]?.interval;
      if (iv && iv.scope === "fleet") {
        out[key] = { id: -1, vehicle_id: null, service_type: key, interval_km: iv.km, interval_engine_hours: iv.engine_hours, interval_days: iv.days, active: true, confirmed: iv.confirmed };
        break;
      }
    }
  }
  return out;
}

/** Fleet default intervals, or (with `truck`) the fleet default next to this truck's override. Saving confirms. */
export function IntervalEditor({ open, onOpenChange, truck, pairs, trucks }: { open: boolean; onOpenChange: (open: boolean) => void; truck?: { id: number; plate: string } | null; pairs?: IntervalPair[]; trucks: MaintainedTruck[] }) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<Line[]>([]);
  const [touched, setTouched] = useState(false);

  const source = useMemo(() => {
    if (truck && pairs) return pairs.map((p) => ({ key: p.service_type, def: p.default, over: p.override }));
    const defaults = defaultsFromTrucks(trucks);
    return SERVICE_ORDER.map((key) => ({ key, def: defaults[key] ?? null, over: null as ServiceIntervalRow | null }));
  }, [truck, pairs, trucks]);

  useEffect(() => {
    if (!open) return;
    setLines(source.map((s) => ({ key: s.key, def: blockFrom(s.def), over: truck ? blockFrom(s.over) : null })));
    setTouched(false);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (key: ServiceKey, scope: "def" | "over", change: Partial<Block> | ((b: Block) => Partial<Block>)) =>
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const current = (scope === "def" ? l.def : l.over) ?? emptyBlock();
        const next = { ...current, ...(typeof change === "function" ? change(current) : change) };
        return scope === "def" ? { ...l, def: next } : { ...l, over: next };
      }),
    );

  const errorFor = (b: Block, override = false): string | null => {
    if (!isDirty(b)) return null;
    if (b.reset && b.original) return null;
    const blankNow = !b.form.km.trim() && !b.form.hours.trim() && !b.form.days.trim();
    if (override && blankNow && b.original) return null; // clearing an override = back to the default (checked on save)
    return intervalRowError(b.form);
  };

  const dirtyCount = lines.reduce((n, l) => n + (isDirty(l.def) ? 1 : 0) + (l.over && isDirty(l.over) ? 1 : 0), 0);
  const unconfirmedDefaults = lines.filter((l) => l.def.original && !l.def.original.confirmed && !l.def.confirmedAsIs).length;

  const save = useMutation({
    mutationFn: async () => {
      for (const l of lines) {
        if (isDirty(l.def) && !(l.def.reset && l.def.original)) {
          await fh.putInterval({ service_type: l.key, vehicle_id: null, ...intervalBody(l.def.form), confirmed: true });
        }
        const o = l.over;
        if (truck && o && isDirty(o)) {
          const blankNow = !o.form.km.trim() && !o.form.hours.trim() && !o.form.days.trim();
          if ((o.reset || blankNow) && o.original && o.original.id > 0) await fh.deleteInterval(o.original.id);
          else if (!blankNow) await fh.putInterval({ service_type: l.key, vehicle_id: truck.id, ...intervalBody(o.form), confirmed: true });
        }
      }
    },
    onSuccess: () => {
      invalidateFleetHealth(qc, "maintenance");
      onOpenChange(false);
    },
    onError: () => invalidateFleetHealth(qc, "maintenance"),
  });

  const submit = () => {
    setTouched(true);
    if (lines.some((l) => errorFor(l.def) || (l.over && errorFor(l.over, true)))) return;
    if (!dirtyCount) {
      onOpenChange(false);
      return;
    }
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={truck ? `Fleet Health / ${truck.plate}` : "Fleet Health / Service intervals"}
      title={truck ? "Service intervals" : "Fleet service intervals"}
      description={
        truck
          ? "The fleet default applies unless this truck has its own override. A service is due when any of its limits is reached."
          : "These fleet defaults apply to every truck without its own override. A service is due when any of its limits is reached."
      }
      width="max-w-4xl"
      testId="fh-interval-editor"
      footer={
        <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-[#77787b]">Saving marks the changed rows as confirmed by logistics.</span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button type="button" className={btn} onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : dirtyCount ? `Save and confirm ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}` : "Close"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 p-4 md:p-6">
        {unconfirmedDefaults > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border border-[#e6c36a] bg-[#fff6dd] px-4 py-3 text-[13px] text-[#6b4a00]">
            <span>
              <strong>{unconfirmedDefaults}</strong> interval{unconfirmedDefaults === 1 ? " is a" : "s are"} placeholder{unconfirmedDefaults === 1 ? "" : "s"}. If logistics agrees with the values shown, confirm them as they are.
            </span>
            <button type="button" className={btn} onClick={() => setLines((ls) => ls.map((l) => (l.def.original && !l.def.original.confirmed ? { ...l, def: { ...l.def, confirmedAsIs: true } } : l)))}>
              <Check size={14} aria-hidden /> Confirm all as shown
            </button>
          </div>
        )}

        {lines.map((l) => (
          <section key={l.key} className="border border-[#e4e3df] bg-white" data-testid={`fh-interval-${l.key}`}>
            <div className="border-b border-[#efeeeb] bg-[#fafaf8] px-4 py-2.5 text-[15px] font-semibold">{SERVICE_LONG_LABELS[l.key]}</div>
            <div className={cx("grid gap-px bg-[#efeeeb]", truck && "md:grid-cols-2")}>
              <BlockEditor title="Fleet default" block={l.def} touched={touched} error={errorFor(l.def)} onChange={(c) => patch(l.key, "def", c)} idPrefix={`${l.key}-def`} />
              {truck && l.over && <BlockEditor title={`${truck.plate} override`} block={l.over} touched={touched} error={errorFor(l.over, true)} onChange={(c) => patch(l.key, "over", c)} idPrefix={`${l.key}-over`} override />}
            </div>
          </section>
        ))}
        {save.isError && <InlineError>{errorMessage(save.error)}</InlineError>}
      </div>
    </Modal>
  );
}

function BlockEditor({ title, block, touched, error, onChange, idPrefix, override }: { title: string; block: Block; touched: boolean; error: string | null; onChange: (c: Partial<Block> | ((b: Block) => Partial<Block>)) => void; idPrefix: string; override?: boolean }) {
  const dirty = isDirty(block);
  const hasOriginal = Boolean(block.original);
  const blank = !block.form.km.trim() && !block.form.hours.trim() && !block.form.days.trim();
  const chip = dirty && !(override && blank && hasOriginal) ? (
    <Pill tone="info">Will be confirmed</Pill>
  ) : override && !hasOriginal ? (
    <Pill tone="none" dashed>
      Uses fleet default
    </Pill>
  ) : override && blank && hasOriginal ? (
    <Pill tone="none" dashed>
      Back to fleet default
    </Pill>
  ) : !hasOriginal ? (
    <Pill tone="none" dashed>
      Not set
    </Pill>
  ) : block.original!.confirmed ? (
    <Pill tone="ok" icon={Check}>
      Confirmed
    </Pill>
  ) : (
    <Pill tone="soon" dashed>
      Placeholder: confirm with logistics
    </Pill>
  );
  const set = (k: keyof IntervalFormRow, v: string) => onChange((b) => ({ form: { ...b.form, [k]: v }, reset: false }));
  const fields: [keyof IntervalFormRow, string][] = [
    ["km", "Distance (km)"],
    ["hours", "Engine hours"],
    ["days", "Days"],
  ];
  return (
    <div className="grid content-start gap-3 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="micro text-[#77787b]">{title}</span>
        {chip}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {fields.map(([k, label]) => (
          <label key={k} className="grid min-w-0 gap-1">
            <span className="truncate text-[11px] text-[#77787b]">{label}</span>
            <input
              id={`${idPrefix}-${k}`}
              inputMode="numeric"
              value={block.form[k]}
              onChange={(e) => set(k, e.target.value)}
              placeholder={override ? "default" : "none"}
              aria-label={`${title} ${label}`}
              className={cx(fieldClass, "mono px-2")}
            />
          </label>
        ))}
      </div>
      {touched && error && <div className="text-xs text-[#a32720]">{error}</div>}
      <div className="flex flex-wrap items-center gap-2">
        {!override && hasOriginal && !block.original!.confirmed && (
          <label className="flex min-h-9 cursor-pointer items-center gap-2 text-[13px]">
            <input type="checkbox" className="h-4 w-4 accent-[#0b0b0b]" checked={block.confirmedAsIs} onChange={(e) => onChange({ confirmedAsIs: e.target.checked })} />
            Confirm as shown
          </label>
        )}
        {override && hasOriginal && !blank && (
          <button type="button" className={btnGhost} onClick={() => onChange({ form: { km: "", hours: "", days: "" }, reset: true })}>
            <RotateCcw size={13} aria-hidden /> Use fleet default
          </button>
        )}
        {dirty && (
          <button type="button" className={btnGhost} onClick={() => onChange((b) => ({ form: { ...b.originalForm }, confirmedAsIs: false, reset: false }))}>
            Undo
          </button>
        )}
      </div>
    </div>
  );
}
