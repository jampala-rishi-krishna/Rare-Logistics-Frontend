import { useRef, useState } from "react";
import { Link, useSearchParams } from "wouter";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import * as driverApi from "@/services/api/driver";
import { isFileValue } from "@/lib/tripForms";
import type { FormValue } from "@/lib/tripForms";
import { newIdempotencyKey } from "@/lib/tripActions";
import { errorMessage } from "@/lib/tripErrors";
import { validateIssue, ISSUE_PRIORITY_LABELS } from "@/lib/issues";
import DriverLayout from "./DriverLayout";
import { PhotoField } from "./fields";
import { useAssignmentQuery, useIssuesQuery, useTemplatesQuery } from "./queries";
import { btnPrimary, btnSecondary, inputClass, useDriverMe, useDriverScope } from "./shared";

export default function DriverIssueForm() {
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const [params] = useSearchParams();
  const batchId = params.get("batch") || null;
  const soId = params.get("so") || null;
  const meta = useIssuesQuery(scope);
  const templates = useTemplatesQuery(scope);
  const detail = useAssignmentQuery(scope, batchId ?? undefined);
  const batch = detail.data?.data;
  const order = batch?.orders.find((o) => String(o.id) === soId) ?? null;

  const key = useRef(newIdempotencyKey()); // one key per report, so a retried tap can never create two
  const photoKey = useRef(newIdempotencyKey());
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("normal");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<FormValue>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const categories = meta.data?.categories ?? [];
  const photosEnabled = Boolean(templates.data?.data.photo_storage_enabled);
  const back = batchId ? `/driver/assignment/${encodeURIComponent(batchId)}` : "/driver/profile";

  const submit = async () => {
    if (busy) return;
    const found = validateIssue({ category, priority, description }, categories);
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setServerError("You are offline. An issue report is only sent when the server receives it, so try again when you have a connection.");
      return;
    }
    setBusy(true);
    try {
      const photoIds: number[] = [];
      if (isFileValue(photo)) {
        const uploaded = await driverApi.uploadPhoto({ blob: photo.blob, filename: photo.filename, batch_id: batchId ?? "profile", so_id: soId, field_key: "issue_photo", upload_key: photoKey.current });
        photoIds.push(uploaded.photo_id);
      }
      const result = await driverApi.postIssue({ idempotency_key: key.current, category, priority, description: description.trim(), batch_id: batchId, so_id: soId, photo_ids: photoIds, client_ts: new Date().toISOString() });
      setReference(result.issue.reference); // confirmation only after the server stored it
    } catch (error) {
      setServerError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DriverLayout scope={scope} name={me.data?.name ?? null} fullScreen>
      <Link href={back} className="mb-3 inline-flex min-h-[48px] items-center gap-2 text-sm font-semibold">
        <ArrowLeft size={18} />
        Back
      </Link>
      <h1 className="text-2xl font-bold leading-tight">Report an issue</h1>

      {reference ? (
        <div className="mt-4 grid gap-3" data-testid="driver-issue-sent">
          <div className="border border-[#33673B]/40 bg-[#f1f8f2] p-4">
            <div className="flex items-center gap-2 text-base font-bold text-[#33673B]">
              <CheckCircle2 size={20} />
              Sent to dispatch
            </div>
            <p className="mt-2 text-sm">
              Reference <span className="font-mono font-bold">{reference}</span>. Dispatch will answer here in Alerts and under My reported issues.
            </p>
          </div>
          <Link href="/driver/issues" className={btnSecondary}>
            My reported issues
          </Link>
          <Link href="/driver/today" className={btnPrimary}>
            Back to Today
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 pb-4">
          <section className="border border-[#e4e3df] bg-white p-4 text-sm" data-testid="driver-issue-related">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Related to</div>
            <div className="mt-1 font-semibold">
              {batchId ? (batch ? `Assignment ${batch.vehicle}` : "Assignment") : "General (not tied to a trip)"}
              {order ? ` · Order ${order.so_number}` : soId ? " · Order" : ""}
            </div>
          </section>

          <label className="grid gap-1.5 text-sm font-semibold">
            Issue category
            <select value={category} onChange={(e) => setCategory(e.target.value)} data-testid="driver-issue-category" className={inputClass}>
              <option value="">Select a category...</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {errors.category && (
              <span role="alert" className="text-sm font-semibold text-[#86000B]">
                {errors.category}
              </span>
            )}
          </label>

          <div className="grid gap-1.5" role="radiogroup" aria-label="Priority">
            <div className="text-sm font-semibold">Priority</div>
            <div className="grid grid-cols-3 gap-2">
              {(["normal", "high", "urgent"] as const).map((p) => (
                <button key={p} type="button" role="radio" aria-checked={priority === p} onClick={() => setPriority(p)} data-testid={`driver-issue-priority-${p}`} className={`min-h-[52px] border px-2 text-sm font-bold ${priority === p ? "border-black bg-black !text-white" : "border-[#d8d7d2] bg-white"}`}>
                  {ISSUE_PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-1.5 text-sm font-semibold">
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={2000} data-testid="driver-issue-description" placeholder="Describe the issue in detail" className={`${inputClass} py-2 font-normal`} />
            {errors.description && (
              <span role="alert" className="text-sm font-semibold text-[#86000B]">
                {errors.description}
              </span>
            )}
          </label>

          {photosEnabled ? (
            <div className="grid gap-1.5">
              <div className="text-sm font-semibold">Photo (optional)</div>
              <PhotoField value={photo} onChange={setPhoto} label="Issue photo" />
            </div>
          ) : (
            <p className="text-xs text-[#77787b]">Photo upload is not set up on the server yet, so the report is sent without a photo.</p>
          )}

          {serverError && (
            <p role="alert" data-testid="driver-issue-error" className="border border-[#f0c4c7] bg-[#fff1f2] p-3 text-sm font-semibold text-[#86000B]">
              {serverError}
            </p>
          )}
          <button type="button" disabled={busy} onClick={() => void submit()} data-testid="driver-issue-submit" className={btnPrimary}>
            {busy ? "Sending..." : "Submit issue"}
          </button>
        </div>
      )}
    </DriverLayout>
  );
}
