// Shared trip logic for the Today card and the trip screen: status chip, the crew actions behind the big button,
// the Start / End / checklist bottom sheets and the "dispatch removed ..." banners.
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as driverApi from "@/services/api/driver";
import { buildAckAnswers, initialAckForm, isVisible, usableItems, validateAck } from "@/lib/tripForms";
import type { AckForm, FieldErrors, FormValue } from "@/lib/tripForms";
import { newIdempotencyKey } from "@/lib/tripActions";
import type { QueueBlob } from "@/lib/offlineQueue";
import { changeKey, farDistanceFor, visibleChanges } from "@/lib/tripNav";
import type { AutoHandover, DispatchChange, Template, TripInfo } from "@/lib/tripTypes";
import { DICTS, getLang, useT, driverMessage } from "./i18n";
import type { Dict } from "./i18n";
import { useCrewAction } from "./queries";
import { showToast } from "./shared";
import type { DriverScope } from "./shared";
import { TemplateField, fieldInput, FieldLabel } from "./fields";
import { Banner, PrimaryButton, Sheet, SheetTitle, TextButton } from "./ui";
import type { ChipTone } from "./ui";

// Status chip of a trip (Today card + trip header).
export function tripChip(t: Dict, status: string | null | undefined, acknowledged: number, total: number, stopsDone: number): { tone: ChipTone; label: string } {
  switch (status) {
    case "on_trip":
      return { tone: "green", label: t.chipOnTrip(Math.min(stopsDone + 1, Math.max(total, 1)), total) };
    case "returned":
    case "handover_submitted":
      return { tone: "blue", label: t.chipWaitingOfficer };
    case "closed":
      return { tone: "green", label: t.chipClosed };
    default:
      return total > 0 && acknowledged >= total ? { tone: "blue", label: t.chipReady } : { tone: "amber", label: t.chipToAck };
  }
}

export function chipOfTrip(t: Dict, trip: TripInfo | null | undefined): { tone: ChipTone; label: string } | null {
  if (!trip) return null;
  return tripChip(t, trip.status, trip.acknowledged, trip.total, trip.stops_done);
}

// The acknowledge checklist is OFF unless an admin saved an active, non-draft template with items (API contract section 3).
export function checklistOf(flag: boolean | undefined, template: Template | null | undefined): Template | null {
  if (!flag || !template || template.is_draft || template.items.length === 0) return null;
  return template;
}

// Handover created at End trip, kept for this session so the invoice list shows its statuses.
export const handoverKey = (batchId: string) => ["driver-handover", batchId] as const;

export function useTripActions(scope: DriverScope, batchId: string) {
  const actions = useCrewAction(scope, batchId);
  const queryClient = useQueryClient();
  const t = () => DICTS[getLang()];

  const acknowledgeAll = (orderCount: number, checklist?: { templateId: number; answers: Record<string, unknown>; blobs: QueueBlob[] } | null) =>
    actions.run({
      kind: "acknowledge_all",
      label: "Acknowledge all",
      path: driverApi.paths.acknowledgeAll(batchId),
      extra: checklist ? { template_id: checklist.templateId, answers: checklist.answers } : {},
      blobs: checklist?.blobs,
      doneMessage: orderCount > 0 ? t().ackDone : undefined,
    });

  const start = () => actions.run({ kind: "start", label: "Start trip", path: driverApi.paths.start(batchId), doneMessage: t().startTrip + " ✓" });

  const checkIn = async (soId: string, soNumber: string) => {
    const out = await actions.run({ kind: "check_in", so_id: soId, label: `Reached ${soNumber}`, path: driverApi.paths.checkIn(batchId, soId) });
    if (out?.status === "done") {
      const far = farDistanceFor(out.response.batch, soId);
      if (far !== undefined) showToast(t().far(far), "warn");
    }
    return out;
  };

  const end = async () => {
    const out = await actions.run({ kind: "end", label: "End trip", path: driverApi.paths.end(batchId), doneMessage: t().tripDone + " ✓" });
    if (out?.status === "done" && out.response.handover) queryClient.setQueryData<AutoHandover>(handoverKey(batchId), out.response.handover);
    return out;
  };

  return { ...actions, acknowledgeAll, start, checkIn, end };
}

export function ConfirmSheet({ open, title, sub, confirmLabel, icon, busy, onConfirm, onClose, testId }: { open: boolean; title: string; sub?: string; confirmLabel: string; icon: "play" | "check" | "warehouse"; busy: boolean; onConfirm: () => void; onClose: () => void; testId: string }) {
  const t = useT();
  return (
    <Sheet open={open} onClose={onClose} busy={busy} testId={testId}>
      <SheetTitle sub={sub}>{title}</SheetTitle>
      <PrimaryButton icon={icon} height={62} fontSize={19} disabled={busy} onClick={onConfirm} testId={`${testId}-confirm`}>
        {busy ? t.gettingLocation : confirmLabel}
      </PrimaryButton>
      <TextButton onClick={onClose} disabled={busy}>
        {t.cancel}
      </TextButton>
    </Sheet>
  );
}

// Checklist shown before the one-tap acknowledge, only when an admin turned it on. The same answers are recorded for
// every order of the trip (one check for the truck, not one per order).
export function ChecklistSheet({ open, template, photoStorage, orderIds, busy, confirmLabel, onClose, onDone }: { open: boolean; template: Template; photoStorage: boolean; orderIds: string[]; busy: boolean; confirmLabel?: string; onClose: () => void; onDone: (answers: Record<string, unknown>, blobs: QueueBlob[]) => void }) {
  const t = useT();
  const items = useMemo(() => usableItems(template.items, photoStorage), [template, photoStorage]);
  const [form, setForm] = useState<AckForm>(() => initialAckForm(items));
  const [errors, setErrors] = useState<FieldErrors>({});
  const visible = items.filter((i) => isVisible(i, items, form.values));
  const set = (key: string, v: FormValue) => setForm((f) => ({ ...f, values: { ...f.values, [key]: v } }));
  const submit = () => {
    const errs = validateAck(items, form.values);
    setErrors(Object.fromEntries(Object.entries(errs).map(([key, message]) => [key, driverMessage(message, t)])));
    if (Object.keys(errs).length > 0) return;
    const built = buildAckAnswers(form, items, newIdempotencyKey);
    const answers: Record<string, unknown> = {};
    for (const id of orderIds) answers[id] = built.answers;
    onDone(answers, built.blobs);
  };
  return (
    <Sheet open={open} onClose={onClose} busy={busy} testId="driver-checklist-sheet">
      <SheetTitle>{t.checklistTitle}</SheetTitle>
      {visible.map((item) => (
        <TemplateField key={item.key} item={item} value={form.values[item.key]} onChange={(v) => set(item.key, v)} required={item.required} error={errors[item.key]} />
      ))}
      <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <FieldLabel>{t.checklistNote}</FieldLabel>
        <input type="text" value={form.general_note} onChange={(e) => setForm((f) => ({ ...f, general_note: e.target.value }))} style={fieldInput} />
      </label>
      <PrimaryButton icon="check" height={62} fontSize={19} disabled={busy} onClick={submit} testId="driver-checklist-confirm">
        {busy ? t.gettingLocation : (confirmLabel ?? t.acknowledgeNOrders(orderIds.length))}
      </PrimaryButton>
      <TextButton onClick={onClose} disabled={busy}>
        {t.cancel}
      </TextButton>
    </Sheet>
  );
}

// ---- dispatch-change banners (dismissal remembered on this phone) ----
const DISMISS_KEY = "rgf.driver.dismissedChanges";

function readDismissed(): Set<string> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(DISMISS_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
}

export function useDispatchChanges(changes: DispatchChange[] | null | undefined, batchId: string | null) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed());
  const list = visibleChanges(changes, batchId, dismissed);
  const dismiss = (c: DispatchChange) => {
    const next = new Set(dismissed);
    next.add(changeKey(c));
    setDismissed(next);
    try {
      window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...next].slice(-100)));
    } catch {
      // storage blocked: dismissed for this visit only
    }
  };
  return { list, dismiss };
}

export function DispatchBanners({ changes, batchId }: { changes: DispatchChange[] | null | undefined; batchId: string | null }) {
  const t = useT();
  const { list, dismiss } = useDispatchChanges(changes, batchId);
  if (list.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {list.map((c) => (
        <Banner key={changeKey(c)} testId={`driver-dispatch-${c.kind}`} onDismiss={() => dismiss(c)} dismissLabel={t.dismiss}>
          {c.kind === "trip_removed" ? t.removedTrip : t.removedOrder(c.so_number ?? c.so_id ?? "")}
        </Banner>
      ))}
    </div>
  );
}
