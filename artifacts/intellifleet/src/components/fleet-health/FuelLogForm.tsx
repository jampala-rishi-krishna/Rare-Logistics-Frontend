import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleHelp, Fuel } from "lucide-react";
import * as fh from "@/services/api/fleetHealth";
import type { FuelLogRow, MaintainedTruck } from "@/services/api/fleetHealth";
import {
  CAPACITY_UNCONFIRMED_TIP,
  blankToNull,
  formatPesoPerLitre,
  fuelLitreWarning,
  manilaInputToIso,
  parseNumber,
  pricePerLitre,
  toManilaInputValue,
  validateFuelLog,
  type FuelFormState,
} from "@/lib/fleetHealth";
import { Modal } from "./Modal";
import { Field, ToggleRow } from "./fields";
import { InlineError, btn, btnPrimary, cx, fieldClass } from "./ui";
import { errorMessage, invalidateFleetHealth } from "./hooks";

const blank = (vehicleId: number | null): FuelFormState => ({ vehicleId, filledAt: toManilaInputValue(new Date()), litres: "", amount: "", odometer: "", fullTank: false, station: "", receipt: "" });

function fromLog(log: FuelLogRow): FuelFormState {
  return {
    vehicleId: log.vehicle_id,
    filledAt: toManilaInputValue(new Date(log.filled_at)),
    litres: String(log.litres),
    amount: String(log.amount_php),
    odometer: log.odometer_km == null ? "" : String(log.odometer_km),
    fullTank: log.full_tank,
    station: log.station ?? "",
    receipt: log.receipt_ref ?? "",
  };
}

/** Add a fill-up (anyone who can enter data) or edit one (admin/dispatcher). */
export function FuelLogForm({ open, onOpenChange, trucks, log, initialTruckId }: { open: boolean; onOpenChange: (o: boolean) => void; trucks: MaintainedTruck[]; log?: FuelLogRow | null; initialTruckId?: number | null }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FuelFormState>(() => blank(initialTruckId ?? null));
  const [touched, setTouched] = useState(false);
  const editing = Boolean(log);

  useEffect(() => {
    if (!open) return;
    setForm(log ? fromLog(log) : blank(initialTruckId ?? null));
    setTouched(false);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, log?.id, initialTruckId]);

  const truck = useMemo(() => trucks.find((t) => t.id === form.vehicleId) ?? null, [trucks, form.vehicleId]);
  const set = <K extends keyof FuelFormState>(k: K, v: FuelFormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const errors = validateFuelLog(form, new Date());
  const show = (k: string) => (touched ? errors[k] : null);
  const litres = parseNumber(form.litres);
  const amount = parseNumber(form.amount);
  const ppl = pricePerLitre(amount, litres);
  const warning = fuelLitreWarning(litres == null || Number.isNaN(litres) ? null : litres, Boolean(truck?.capacity_unconfirmed));

  const save = useMutation({
    mutationFn: () => {
      const num = (v: string) => {
        const n = parseNumber(v);
        return n == null || Number.isNaN(n) ? null : n;
      };
      const body: fh.FuelLogBody = {
        ...(log ? {} : { vehicle_id: form.vehicleId as number }),
        filled_at: manilaInputToIso(form.filledAt),
        litres: num(form.litres) as number,
        amount_php: num(form.amount) as number,
        odometer_km: num(form.odometer),
        full_tank: form.fullTank,
        station: blankToNull(form.station),
        receipt_ref: blankToNull(form.receipt),
        ...(log?.staff_id != null ? { staff_id: log.staff_id } : {}),
      };
      return log ? fh.updateFuelLog(log.id, { ...body, vehicle_id: undefined }) : fh.createFuelLog(body);
    },
    onSuccess: () => {
      invalidateFleetHealth(qc, "fuel");
      onOpenChange(false);
    },
  });

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Fleet Health / Fuel log"
      title={editing ? "Edit fill-up" : "Add fill-up"}
      description="Fuel logs drive km/L, spend and CO2. Mark a fill as full tank so we can measure km/L between full fills."
      width="max-w-xl"
      testId="fh-fuel-form"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btn} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={submit} disabled={save.isPending} data-testid="fh-fuel-submit">
            <Fuel size={15} aria-hidden /> {save.isPending ? "Saving…" : editing ? "Save changes" : "Save fill-up"}
          </button>
        </div>
      }
    >
      <div className="grid gap-5 p-4 md:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Truck" required error={show("vehicleId")}>
            {(id, d) => (
              <select id={id} aria-describedby={d} disabled={editing} value={form.vehicleId ?? ""} onChange={(e) => set("vehicleId", e.target.value ? Number(e.target.value) : null)} className={cx(fieldClass, "font-medium")}>
                <option value="">Choose a truck…</option>
                {trucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.plate}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Filled at (Manila time)" required error={show("filledAt")}>
            {(id, d) => <input id={id} aria-describedby={d} type="datetime-local" value={form.filledAt} onChange={(e) => set("filledAt", e.target.value)} className={fieldClass} />}
          </Field>
        </div>

        {truck?.capacity_unconfirmed && (
          <div className="flex items-start gap-2.5 border border-dashed border-[#e6c36a] bg-[#fff6dd] px-3 py-2.5 text-[13px] leading-5 text-[#6b4a00]" data-testid="fh-capacity-hint">
            <CircleHelp size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              <strong>{truck.plate}: capacity unconfirmed.</strong> {CAPACITY_UNCONFIRMED_TIP}
            </span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Litres" required error={show("litres")}>
            {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={form.litres} onChange={(e) => set("litres", e.target.value)} className={cx(fieldClass, "mono")} placeholder="85.5" />}
          </Field>
          <Field label="Amount paid (₱)" required error={show("amount")}>
            {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={form.amount} onChange={(e) => set("amount", e.target.value)} className={cx(fieldClass, "mono")} placeholder="5191.56" />}
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 border border-[#e4e3df] bg-white px-4 py-3" aria-live="polite" data-testid="fh-ppl">
          <span className="micro text-[#77787b]">Price per litre</span>
          <span className={cx("display-face text-xl font-bold", ppl == null && "text-[#b9b8b3]")}>{formatPesoPerLitre(ppl)}</span>
        </div>

        {warning && (
          <div role="status" className="border border-[#e6c36a] bg-[#fff6dd] px-3 py-2.5 text-[13px] leading-5 text-[#6b4a00]" data-testid="fh-litre-warning">
            {warning}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Odometer (km)" optional error={show("odometer")} hint="Needed to work out km/L">
            {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={form.odometer} onChange={(e) => set("odometer", e.target.value)} className={cx(fieldClass, "mono")} placeholder="193991" />}
          </Field>
          <Field label="Station" optional error={show("station")}>
            {(id, d) => <input id={id} aria-describedby={d} value={form.station} onChange={(e) => set("station", e.target.value)} className={fieldClass} placeholder="Petron Sucat" />}
          </Field>
        </div>

        <ToggleRow checked={form.fullTank} onChange={(v) => set("fullTank", v)} label="Full tank" hint="Tank was filled to the top. km/L is measured between two full-tank fills." />

        <Field label="Receipt" optional error={show("receipt")} hint="Link or reference only, such as a receipt number. Files are not uploaded here.">
          {(id, d) => <input id={id} aria-describedby={d} value={form.receipt} onChange={(e) => set("receipt", e.target.value)} className={fieldClass} placeholder="https://… or OR-10234" />}
        </Field>

        {save.isError && <InlineError>{errorMessage(save.error)}</InlineError>}
      </div>
    </Modal>
  );
}
