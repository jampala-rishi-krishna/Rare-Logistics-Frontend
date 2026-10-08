import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, ShieldAlert, TriangleAlert } from "lucide-react";
import * as fh from "@/services/api/fleetHealth";
import type { ChecklistItemKey, ChecklistResult, ChecklistValue, MaintainedTruck } from "@/services/api/fleetHealth";
import {
  CHECKLIST_ITEMS,
  checklistOutcome,
  defaultChecklistItems,
  validateChecklist,
  blankToNull,
  TONES,
  parseNumber,
} from "@/lib/fleetHealth";
import { Modal } from "./Modal";
import { Choice, Field } from "./fields";
import { InlineError, btn, btnPrimary, cx, fieldClass, textareaClass } from "./ui";
import { errorMessage, invalidateFleetHealth } from "./hooks";

/** Mobile-first pre-trip check: pick the truck, tap OK / Issue / N/A on eight items, submit. */
export function ChecklistForm({ open, onOpenChange, trucks, initialTruckId }: { open: boolean; onOpenChange: (open: boolean) => void; trucks: MaintainedTruck[]; initialTruckId?: number | null }) {
  const qc = useQueryClient();
  const [vehicleId, setVehicleId] = useState<number | null>(initialTruckId ?? null);
  const truck = useMemo(() => trucks.find((t) => t.id === vehicleId) ?? null, [trucks, vehicleId]);
  const [items, setItems] = useState<Record<ChecklistItemKey, ChecklistValue>>(() => defaultChecklistItems(truck?.is_reefer));
  const [reeferTemp, setReeferTemp] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<ChecklistResult | null>(null);

  useEffect(() => {
    if (open) {
      setVehicleId(initialTruckId ?? null);
      setItems(defaultChecklistItems(trucks.find((t) => t.id === initialTruckId)?.is_reefer));
      setReeferTemp("");
      setNotes("");
      setTouched(false);
      setResult(null);
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTruckId]);

  const outcome = checklistOutcome(items);
  const errors = validateChecklist({ vehicleId, items, reeferTemp, notes }, truck?.is_reefer);
  const showErrors = touched;

  const save = useMutation({
    mutationFn: () => {
      const temp = truck?.is_reefer ? parseNumber(reeferTemp) : null;
      return fh.createChecklist({ vehicle_id: vehicleId as number, items, reefer_temp_c: temp == null || Number.isNaN(temp) ? null : temp, notes: blankToNull(notes) });
    },
    onSuccess: (data) => {
      setResult(data);
      invalidateFleetHealth(qc, "maintenance");
    },
  });

  const pickTruck = (id: number | null) => {
    setVehicleId(id);
    const next = trucks.find((t) => t.id === id);
    setItems((prev) => ({ ...prev, reefer_running: next?.is_reefer ? (prev.reefer_running === "na" ? "ok" : prev.reefer_running) : "na" }));
    if (!next?.is_reefer) setReeferTemp("");
  };

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    save.mutate();
  };

  const reset = () => {
    setItems(defaultChecklistItems(truck?.is_reefer));
    setReeferTemp("");
    setNotes("");
    setTouched(false);
    setResult(null);
    setVehicleId(null);
    save.reset();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Fleet Health / Pre-trip"
      title="New pre-trip check"
      description={result ? undefined : "Walk around the truck and mark each item. It takes under a minute."}
      width="max-w-xl"
      testId="fh-checklist-form"
      footer={
        result ? (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btn} onClick={reset}>
              Check another truck
            </button>
            <button type="button" className={btnPrimary} onClick={() => onOpenChange(false)}>
              Done
            </button>
          </div>
        ) : (
          <div className="grid gap-2">
            <div
              role="status"
              aria-live="polite"
              data-testid="fh-checklist-outcome"
              className="flex items-center gap-2 border px-3 py-2.5 text-[13px] font-semibold"
              style={{ color: TONES[outcome.pass ? "ok" : outcome.severity === "critical" ? "over" : "soon"].fg, background: TONES[outcome.pass ? "ok" : outcome.severity === "critical" ? "over" : "soon"].bg, borderColor: TONES[outcome.pass ? "ok" : outcome.severity === "critical" ? "over" : "soon"].border }}
            >
              {outcome.pass ? <CheckCircle2 size={16} aria-hidden /> : <TriangleAlert size={16} aria-hidden />}
              {outcome.text}
            </div>
            <button type="button" onClick={submit} disabled={save.isPending} className={cx(btnPrimary, "h-12 w-full text-base! md:h-11")} data-testid="fh-checklist-submit">
              {save.isPending ? "Saving…" : "Submit check"}
            </button>
          </div>
        )
      }
    >
      {result ? (
        <ChecklistDone result={result} plate={truck?.plate ?? ""} />
      ) : (
        <div className="grid gap-5 p-4 md:p-6">
          <Field label="Truck" required error={showErrors ? errors.vehicleId : null}>
            {(id, d) => (
              <select id={id} aria-describedby={d} value={vehicleId ?? ""} onChange={(e) => pickTruck(e.target.value ? Number(e.target.value) : null)} className={cx(fieldClass, "font-medium")}>
                <option value="">Choose a truck…</option>
                {trucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.plate}
                    {t.kind === "no_tracker" ? " (no tracker)" : ""}
                    {t.is_reefer ? " · reefer" : ""}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <fieldset className="grid gap-2.5">
            <legend className="micro mb-1 text-[#77787b]">Walk-around</legend>
            {CHECKLIST_ITEMS.map((item) => {
              const value = items[item.key];
              const notReefer = item.key === "reefer_running" && truck && !truck.is_reefer;
              return (
                <div key={item.key} className={cx("grid gap-2 border bg-white p-3 sm:grid-cols-[1fr_auto] sm:items-center", value === "issue" ? "border-[#e8aaa6] bg-[#fffafa]" : "border-[#e4e3df]")}>
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold leading-tight">{item.label}</div>
                    <div className="mt-1 text-xs leading-4 text-[#77787b]">{notReefer ? "Not a reefer, so this is N/A" : item.hint}</div>
                  </div>
                  <Choice
                    label={item.label}
                    value={value}
                    onChange={(v) => setItems((prev) => ({ ...prev, [item.key]: v }))}
                    className="sm:w-[210px]"
                    options={[
                      { value: "ok", label: "OK", tone: "ok" },
                      { value: "issue", label: "Issue", tone: "over" },
                      { value: "na", label: "N/A", tone: "none" },
                    ]}
                  />
                </div>
              );
            })}
          </fieldset>

          {truck?.is_reefer && (
            <Field label="Reefer temperature (°C)" optional error={showErrors ? errors.reeferTemp : null} hint="Reading on the unit display, e.g. -18">
              {(id, d) => <input id={id} aria-describedby={d} inputMode="decimal" value={reeferTemp} onChange={(e) => setReeferTemp(e.target.value)} placeholder="-18" className={cx(fieldClass, "mono")} />}
            </Field>
          )}

          <Field label="Notes" optional error={showErrors ? errors.notes : null}>
            {(id, d) => <textarea id={id} aria-describedby={d} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the dispatcher should know" className={textareaClass} rows={3} />}
          </Field>

          {save.isError && <InlineError>{errorMessage(save.error)}</InlineError>}
        </div>
      )}
    </Modal>
  );
}

function ChecklistDone({ result, plate }: { result: ChecklistResult; plate: string }) {
  const raised = result.flag && result.flag.flag;
  return (
    <div className="grid gap-5 p-6 text-center md:p-10" data-testid="fh-checklist-done">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border" style={{ color: TONES[result.passed ? "ok" : "soon"].fg, background: TONES[result.passed ? "ok" : "soon"].bg, borderColor: TONES[result.passed ? "ok" : "soon"].border }}>
        {result.passed ? <ClipboardCheck size={24} aria-hidden /> : <ShieldAlert size={24} aria-hidden />}
      </span>
      <div>
        <div className="display-face text-2xl font-bold">{result.passed ? "Check saved: pass" : "Check saved: issue found"}</div>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#55565a]">
          {plate ? `${plate}: ` : ""}
          {result.passed ? "All items are OK or not applicable." : raised ? `We raised a ${result.flag?.flag.severity} issue so dispatch can follow up.` : "An open issue already covers this."}
        </p>
      </div>
      {raised && (
        <div className="mx-auto max-w-md border border-[#e6c36a] bg-[#fff6dd] px-4 py-3 text-left text-[13px] text-[#6b4a00]">
          <div className="micro mb-1.5 text-[#8a5a00]">Issue {result.flag?.created ? "created" : "already open"}</div>
          {result.flag?.flag.message}
        </div>
      )}
    </div>
  );
}
