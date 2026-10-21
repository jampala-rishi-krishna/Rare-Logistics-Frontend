// "Cancel delivery" at a stop (the customer or the sales agent asked): pure form logic for the check-out sheet.
// Server contract (backend/services/cancel_request.py): answers.outcome = "cancelled_by_request" + cancel_requested_by
// (customer | sales_agent) + cancel_requester_name + reason (+ cancel_note) + cancel_proof (photo, mandatory). The outcome
// question of the template is replaced, so items shown only for an outcome (delivery photo, received by) are not sent.
import type { TemplateItem } from "./tripTypes.ts";
import type { QueueBlob } from "./offlineQueue.ts";
import { buildCheckoutAnswers, isFileValue, validateCheckout, type FieldErrors, type FormValue, type FormValues } from "./tripForms.ts";

export const CANCELLED_OUTCOME = "cancelled_by_request";
export const CANCEL_PROOF_KEY = "cancel_proof";
export type CancelRequester = "customer" | "sales_agent";

export interface CancelForm {
  requestedBy: CancelRequester | null;
  name: string;
  reason: string; // English chip text (or the typed "Other" text)
  note: string;
  photo: FormValue;
}

export const emptyCancelForm = (): CancelForm => ({ requestedBy: null, name: "", reason: "", note: "", photo: null });

export const isCancelledOutcome = (outcome: unknown): boolean => typeof outcome === "string" && outcome.trim().toLowerCase() === CANCELLED_OUTCOME;

export const hasCancelPhoto = (form: Pick<CancelForm, "photo">): boolean => isFileValue(form.photo);

// Errors keyed like the server's (cancel_requested_by / cancel_requester_name / reason / cancel_proof), plus the template's
// own remaining fields (invoice / DR number) validated without the outcome question.
export function validateCancel(items: TemplateItem[], values: FormValues, form: CancelForm): FieldErrors {
  const errors: FieldErrors = validateCheckout(withoutOutcome(items), values);
  if (form.requestedBy !== "customer" && form.requestedBy !== "sales_agent") errors.cancel_requested_by = "Choose who asked";
  if (!form.name.trim()) errors.cancel_requester_name = "Required";
  if (!form.reason.trim()) errors.reason = "Give a reason";
  if (!hasCancelPhoto(form)) errors[CANCEL_PROOF_KEY] = "Take a photo first";
  return errors;
}

// Submit stays disabled until the proof photo is attached (the other fields show their errors on tap).
export const cancelSubmitEnabled = (form: CancelForm): boolean => hasCancelPhoto(form);

function withoutOutcome(items: TemplateItem[]): TemplateItem[] {
  return items.filter((i) => i.key !== "outcome");
}

export function buildCancelAnswers(items: TemplateItem[], values: FormValues, form: CancelForm, newUploadKey: () => string): { answers: Record<string, unknown>; blobs: QueueBlob[] } {
  const base = buildCheckoutAnswers(withoutOutcome(items), values, newUploadKey);
  const answers: Record<string, unknown> = {
    ...base.answers,
    outcome: CANCELLED_OUTCOME,
    cancel_requested_by: form.requestedBy,
    cancel_requester_name: form.name.trim(),
    reason: form.reason.trim(),
    ...(form.note.trim() ? { cancel_note: form.note.trim() } : {}),
  };
  const blobs = [...base.blobs];
  const v = form.photo;
  if (isFileValue(v)) {
    answers[CANCEL_PROOF_KEY] = null; // replaced by the photo_id once uploaded (same queue as every other proof photo)
    blobs.push({ field_key: CANCEL_PROOF_KEY, upload_key: v.upload_key ?? newUploadKey(), blob: v.blob, filename: v.filename, ...(v.captured_at ? { captured_at: v.captured_at } : {}) });
  }
  return { answers, blobs };
}
