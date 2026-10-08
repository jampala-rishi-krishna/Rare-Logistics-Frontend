import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as fh from "@/services/api/fleetHealth";
import type { FlagSeverity, IssueResult } from "@/services/api/fleetHealth";
import { blankToNull, validateIssue, type IssueFormState } from "@/lib/fleetHealth";
import { Modal } from "./Modal";
import { Choice, Field } from "./fields";
import { Banner, InlineError, btn, btnPrimary, fieldClass, textareaClass } from "./ui";
import { errorMessage, invalidateFleetHealth } from "./hooks";

const blank = (): IssueFormState => ({ severity: "warning", message: "", ref: "", photoRef: "" });

/** Report an issue on one truck (POST /issues, source "manual"). */
export function IssueForm({ open, onOpenChange, truck }: { open: boolean; onOpenChange: (o: boolean) => void; truck: { id: number; plate: string } }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<IssueFormState>(blank);
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState<IssueResult | null>(null);

  useEffect(() => {
    if (open) {
      setForm(blank());
      setTouched(false);
      setResult(null);
      save.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const errors = validateIssue(form);
  const save = useMutation({
    mutationFn: () => fh.createIssue({ vehicle: truck.id, source: "manual", severity: form.severity, message: form.message.trim(), ref: blankToNull(form.ref), photo_ref: blankToNull(form.photoRef) }),
    onSuccess: (data) => {
      setResult(data);
      invalidateFleetHealth(qc, "maintenance");
    },
  });
  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    save.mutate();
  };
  const show = (k: string) => (touched ? errors[k] : null);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={`Fleet Health / ${truck.plate}`}
      title="Report an issue"
      description="Open issues add to the truck's risk score until a dispatcher resolves them."
      width="max-w-lg"
      testId="fh-issue-form"
      footer={
        result ? (
          <div className="flex justify-end">
            <button type="button" className={btnPrimary} onClick={() => onOpenChange(false)}>
              Done
            </button>
          </div>
        ) : (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" className={btn} onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="button" className={btnPrimary} onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Sending…" : "Report issue"}
            </button>
          </div>
        )
      }
    >
      {result ? (
        <div className="grid gap-4 p-4 md:p-6">
          <Banner tone="info">{result.created ? "Issue reported. It now counts toward this truck's risk score." : "An identical issue is already open for this truck today, so nothing new was added."}</Banner>
          <div className="border border-[#e4e3df] bg-white p-4 text-sm leading-6">{result.flag.message}</div>
        </div>
      ) : (
        <div className="grid gap-5 p-4 md:p-6">
          <Field label="Severity" required>
            {() => (
              <Choice<FlagSeverity>
                label="Severity"
                value={form.severity}
                onChange={(v) => setForm((f) => ({ ...f, severity: v }))}
                options={[
                  { value: "info", label: "Info", tone: "none" },
                  { value: "warning", label: "Warning", tone: "soon" },
                  { value: "critical", label: "Critical", tone: "over" },
                ]}
              />
            )}
          </Field>
          <Field label="What is wrong?" required error={show("message")} hint={`${form.message.trim().length} / 500`}>
            {(id, d) => <textarea id={id} aria-describedby={d} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} className={textareaClass} rows={4} placeholder="e.g. Brake pedal feels soft since this morning" maxLength={520} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference" optional error={show("ref")} hint="Call id, SO number…">
              {(id, d) => <input id={id} aria-describedby={d} value={form.ref} onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))} className={fieldClass} />}
            </Field>
            <Field label="Photo link" optional error={show("photoRef")} hint="Link only, no file upload">
              {(id, d) => <input id={id} aria-describedby={d} value={form.photoRef} onChange={(e) => setForm((f) => ({ ...f, photoRef: e.target.value }))} className={fieldClass} placeholder="https://…" />}
            </Field>
          </div>
          {save.isError && <InlineError>{errorMessage(save.error)}</InlineError>}
        </div>
      )}
    </Modal>
  );
}
