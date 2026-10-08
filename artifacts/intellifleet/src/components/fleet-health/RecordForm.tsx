import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as fh from "@/services/api/fleetHealth";
import type { MaintenanceRecord, MaintenanceRecordBody, ServiceKey } from "@/services/api/fleetHealth";
import {
  SERVICE_LONG_LABELS,
  SERVICE_ORDER,
  blankToNull,
  manilaInputToIso,
  manilaToday,
  parseNumber,
  toManilaInputValue,
  validateRecord,
  type RecordFormState,
} from "@/lib/fleetHealth";
import { Modal } from "./Modal";
import { Choice, Field, FormSection } from "./fields";
import { InlineError, btn, btnPrimary, cx, fieldClass, textareaClass } from "./ui";
import { errorMessage, invalidateFleetHealth } from "./hooks";

export interface RecordPreset {
  kind?: "service" | "repair" | "inspection";
  serviceType?: ServiceKey;
  downtimeStartNow?: boolean;
  odometer?: number | null;
  reason?: string;
}

export function recordToForm(r: MaintenanceRecord): RecordFormState {
  return {
    kind: r.kind,
    serviceType: r.service_type ?? "",
    performedOn: r.performed_on,
    odometer: r.odometer_km == null ? "" : String(r.odometer_km),
    engineHours: r.engine_hours == null ? "" : String(r.engine_hours),
    downtimeStart: r.downtime_start ? toManilaInputValue(new Date(r.downtime_start)) : "",
    downtimeEnd: r.downtime_end ? toManilaInputValue(new Date(r.downtime_end)) : "",
    reason: r.reason ?? "",
    cost: r.cost_php == null ? "" : String(r.cost_php),
    vendor: r.vendor ?? "",
    notes: r.notes ?? "",
    receipt: r.receipt_ref ?? "",
  };
}

export function formToBody(form: RecordFormState, vehicleId?: number): MaintenanceRecordBody {
  const num = (v: string) => {
    const n = parseNumber(v);
    return n == null || Number.isNaN(n) ? null : n;
  };
  return {
    ...(vehicleId != null ? { vehicle_id: vehicleId } : {}),
    kind: form.kind,
    service_type: form.kind === "service" ? (form.serviceType || null) : null,
    performed_on: form.performedOn,
    odometer_km: num(form.odometer),
    engine_hours: num(form.engineHours),
    downtime_start: form.downtimeStart ? manilaInputToIso(form.downtimeStart) : null,
    downtime_end: form.downtimeEnd ? manilaInputToIso(form.downtimeEnd) : null,
    reason: blankToNull(form.reason),
    cost_php: num(form.cost),
    vendor: blankToNull(form.vendor),
    notes: blankToNull(form.notes),
    receipt_ref: blankToNull(form.receipt),
  };
}

function blank(now: Date, odometer?: number | null): RecordFormState {
  return { kind: "service", serviceType: "", performedOn: manilaToday(now), odometer: odometer ? String(Math.round(odometer)) : "", engineHours: "", downtimeStart: "", downtimeEnd: "", reason: "", cost: "", vendor: "", notes: "", receipt: "" };
}

/** Log a service / repair / inspection, or edit an existing record. */
export function RecordForm({
  open,
  onOpenChange,
  truck,
  record,
  preset,
  showReefer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  truck: { id: number; plate: string; odometer_km: number | null };
  record?: MaintenanceRecord | null;
  preset?: RecordPreset | null;
  showReefer: boolean;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<RecordFormState>(() => blank(new Date(), truck.odometer_km));
  const [touched, setTouched] = useState(false);
  const editing = Boolean(record);

  useEffect(() => {
    if (!open) return;
    const now = new Date();
    if (record) setForm(recordToForm(record));
    else {
      const base = blank(now, preset?.odometer ?? truck.odometer_km);
      setForm({
        ...base,
        kind: preset?.kind ?? base.kind,
        serviceType: preset?.serviceType ?? "",
        downtimeStart: preset?.downtimeStartNow ? toManilaInputValue(now) : "",
        reason: preset?.reason ?? "",
      });
    }
    setTouched(false);
    save.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id, preset?.kind, preset?.serviceType]);

  const today = manilaToday(new Date());
  const errors = validateRecord(form, today);
  const set = <K extends keyof RecordFormState>(key: K, value: RecordFormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const show = (key: string) => (touched ? errors[key] : null);

  const save = useMutation({
    mutationFn: () => {
      const body = formToBody(form, record ? undefined : truck.id);
      return record ? fh.updateRecord(record.id, body) : fh.createRecord(body);
    },
    onSuccess: () => {
      invalidateFleetHealth(qc, "maintenance");
      onOpenChange(false);
    },
  });

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    save.mutate();
  };

  const types = SERVICE_ORDER.filter((k) => k !== "reefer_service" || showReefer);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={`Fleet Health / ${truck.plate}`}
      title={editing ? "Edit record" : form.kind === "repair" ? "Add repair record" : form.kind === "inspection" ? "Log inspection" : "Log service"}
      description="Saving updates the service bars and risk score straight away."
      width="max-w-2xl"
      testId="fh-record-form"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={btn} onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="button" className={btnPrimary} onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save changes" : "Save record"}
          </button>
        </div>
      }
    >
      <div className="grid gap-6 p-4 md:p-6">
        <FormSection title="What happened">
          <Field label="Record type">
            {() => (
              <Choice
                label="Record type"
                value={form.kind}
                onChange={(v) => set("kind", v)}
                options={[
                  { value: "service", label: "Service" },
                  { value: "repair", label: "Repair" },
                  { value: "inspection", label: "Inspection" },
                ]}
              />
            )}
          </Field>
          {form.kind === "service" && (
            <Field label="Service type" required error={show("serviceType")}>
              {(id, d) => (
                <select id={id} aria-describedby={d} value={form.serviceType} onChange={(e) => set("serviceType", e.target.value as ServiceKey | "")} className={fieldClass}>
                  <option value="">Choose a service…</option>
                  {types.map((k) => (
                    <option key={k} value={k}>
                      {SERVICE_LONG_LABELS[k]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date" required error={show("performedOn")}>
              {(id, d) => <input id={id} aria-describedby={d} type="date" max={today} value={form.performedOn} onChange={(e) => set("performedOn", e.target.value)} className={fieldClass} />}
            </Field>
            <Field label="Odometer (km)" optional error={show("odometer")}>
              {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={form.odometer} onChange={(e) => set("odometer", e.target.value)} className={cx(fieldClass, "mono")} placeholder="193070" />}
            </Field>
            <Field label="Engine hours" optional error={show("engineHours")}>
              {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={form.engineHours} onChange={(e) => set("engineHours", e.target.value)} className={cx(fieldClass, "mono")} />}
            </Field>
          </div>
        </FormSection>

        {form.kind === "repair" && (
          <FormSection title="Downtime">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Downtime start" optional error={show("downtimeStart")}>
                {(id, d) => <input id={id} aria-describedby={d} type="datetime-local" value={form.downtimeStart} onChange={(e) => set("downtimeStart", e.target.value)} className={fieldClass} />}
              </Field>
              <Field label="Downtime end" optional error={show("downtimeEnd")} hint="Leave empty while the truck is still in the shop">
                {(id, d) => <input id={id} aria-describedby={d} type="datetime-local" value={form.downtimeEnd} onChange={(e) => set("downtimeEnd", e.target.value)} className={fieldClass} />}
              </Field>
            </div>
            <Field label="Reason" optional error={show("reason")}>
              {(id, d) => <input id={id} aria-describedby={d} value={form.reason} onChange={(e) => set("reason", e.target.value)} className={fieldClass} placeholder="e.g. Transmission rebuild" />}
            </Field>
          </FormSection>
        )}

        <FormSection title="Cost and vendor">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Cost (₱)" optional error={show("cost")}>
              {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={form.cost} onChange={(e) => set("cost", e.target.value)} className={cx(fieldClass, "mono")} placeholder="3500" />}
            </Field>
            <Field label="Vendor" optional error={show("vendor")}>
              {(id, d) => <input id={id} aria-describedby={d} value={form.vendor} onChange={(e) => set("vendor", e.target.value)} className={fieldClass} placeholder="Shop or supplier" />}
            </Field>
          </div>
          <Field label="Receipt" optional error={show("receipt")} hint="Link or reference only, such as an invoice number. Files are not uploaded here.">
            {(id, d) => <input id={id} aria-describedby={d} value={form.receipt} onChange={(e) => set("receipt", e.target.value)} className={fieldClass} placeholder="https://… or OR-10234" />}
          </Field>
          <Field label="Notes" optional error={show("notes")}>
            {(id, d) => <textarea id={id} aria-describedby={d} value={form.notes} onChange={(e) => set("notes", e.target.value)} className={textareaClass} rows={3} />}
          </Field>
        </FormSection>

        {save.isError && <InlineError>{errorMessage(save.error)}</InlineError>}
      </div>
    </Modal>
  );
}
