import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Eye, Loader2, RefreshCw, Send, X } from "lucide-react";
import * as inventoryApi from "@/services/api/inventory";
import { canSendEmail, parseRecipients, removeRecipient } from "@/lib/recipients";
import { describeCounts } from "@/lib/orderMerge";
import { buttonClass, inputClass, primaryButtonClass } from "./ToolbarControls";

type Warehouse = "mets" | "glacier";
type SendState = "idle" | "queued" | "sent" | "failed";

const WAREHOUSE_LABEL: Record<Warehouse, string> = { mets: "Mets", glacier: "Glacier" };

function base64ToBlobUrl(base64: string, type: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return URL.createObjectURL(new Blob([bytes], { type }));
}

/** Removable-chip recipient input: comma / space / semicolon / Enter / blur commit the typed text. */
function RecipientField({ label, required, chips, onChange, testId }: { label: string; required?: boolean; chips: string[]; onChange: (next: string[]) => void; testId: string }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const commit = (value: string) => {
    if (!value.trim()) return;
    const { added, invalid, duplicates } = parseRecipients(value, chips);
    if (added.length) onChange([...chips, ...added]);
    setText(invalid.join(" "));
    setProblem(invalid.length ? `Not a valid email: ${invalid.join(", ")}` : duplicates.length ? `Already added: ${duplicates.join(", ")}` : "");
  };
  return (
    <div className="grid gap-1 text-sm font-semibold text-[#0b0b0b]">
      <span>
        {label}
        {required && <span className="text-[#86000B]"> *</span>}
      </span>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-[4px] border border-[#d8d7d2] bg-white px-2 py-1.5 focus-within:border-[#0b0b0b]" data-testid={testId}>
        {chips.map((email) => (
          <span key={email} className="inline-flex items-center gap-1 rounded-full border border-[#d8d7d2] bg-[#f2f2ef] py-0.5 pl-2.5 pr-1 text-xs font-normal">
            {email}
            <button type="button" aria-label={`Remove ${email}`} onClick={() => onChange(removeRecipient(chips, email))} className="rounded-full p-0.5 hover:bg-[#e0dfda]">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={text}
          aria-label={`${label} recipients`}
          placeholder={chips.length ? "" : "name@company.com, ..."}
          className="min-w-[140px] flex-1 bg-transparent py-0.5 text-sm font-normal outline-none"
          onChange={(event) => {
            const value = event.target.value;
            if (/[,;\s]$/.test(value)) commit(value);
            else {
              setText(value);
              setProblem("");
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(text);
            } else if (event.key === "Backspace" && !text && chips.length) onChange(chips.slice(0, -1));
          }}
          onBlur={() => commit(text)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (/[,;\s]/.test(pasted.trim())) {
              event.preventDefault();
              commit(`${text}${pasted}`);
            }
          }}
        />
      </div>
      {problem && (
        <span role="alert" className="text-xs font-normal text-[#86000B]">
          {problem}
        </span>
      )}
    </div>
  );
}

export default function ConfirmedEmailDialog({ orderIds, dateFrom, dateTo, onClose }: { orderIds: string[]; dateFrom: string; dateTo: string; onClose: () => void }) {
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState<inventoryApi.EmailDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const draftRequest = useRef(0);
  const [preview, setPreview] = useState<inventoryApi.ConfirmedEmailPreview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [error, setError] = useState("");
  const subjectTouched = useRef(false);

  // The body is the fixed RareChain HTML template from the backend draft endpoint (same one the old email flow used).
  const loadDraft = async (target: Warehouse) => {
    const request = ++draftRequest.current;
    setDraft(null);
    setDraftError("");
    setDraftLoading(true);
    try {
      const result = await inventoryApi.createSalesOrderEmailDraft({ date_from: dateFrom, date_to: dateTo, status: "All", search: "", order_ids: orderIds, assignment: "assigned" });
      if (request !== draftRequest.current) return;
      setDraft(result);
      if (!subjectTouched.current) setSubject(`${result.subject} - ${WAREHOUSE_LABEL[target]}`);
    } catch (reason: any) {
      if (request !== draftRequest.current) return;
      setDraftError(reason?.message || "Could not load the email draft.");
    } finally {
      if (request === draftRequest.current) setDraftLoading(false);
    }
  };

  // Esc closes only the top-most layer: the attachment popup first, then the email dialog.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (attachmentsOpen) setAttachmentsOpen(false);
      else if (sendState !== "queued") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, sendState, attachmentsOpen]);

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const chooseWarehouse = (next: Warehouse) => {
    if (next === warehouse) return;
    setWarehouse(next);
    setAttachmentsOpen(false);
    void loadDraft(next);
    // A different warehouse means different lines: the old preview no longer applies.
    setPreview(null);
    setPdfUrl(null);
    setSendState("idle");
    setError("");
  };

  const openAttachments = async () => {
    if (!warehouse) return;
    setAttachmentsOpen(true);
    if (preview) return;
    setPreviewing(true);
    setError("");
    setSendState("idle");
    try {
      const result = await inventoryApi.previewConfirmedEmail({ warehouse, order_ids: orderIds, date_from: dateFrom, date_to: dateTo });
      setPdfUrl(base64ToBlobUrl(result.pdf_base64, "application/pdf"));
      setPreview(result);
    } catch (reason: any) {
      setPreview(null);
      setPdfUrl(null);
      setError(reason?.message || "Could not build the preview.");
    } finally {
      setPreviewing(false);
    }
  };

  const ready = canSendEmail(warehouse, to) && Boolean(subject.trim()) && Boolean(preview) && Boolean(draft);
  const send = async () => {
    if (!warehouse || !ready || !draft) return;
    setError("");
    setSendState("queued");
    try {
      const result = await inventoryApi.sendConfirmedEmail({ warehouse, order_ids: orderIds, to, cc, subject: subject.trim(), html_body: draft.htmlBody, date_from: dateFrom, date_to: dateTo });
      if (result.success === false || result.status === "failed") throw new Error("The email could not be sent.");
      setSendState("sent");
    } catch (reason: any) {
      setSendState("failed");
      setError(reason?.message || "The email could not be sent.");
    }
  };

  const previewRows = useMemo(() => (preview?.rows ?? []).slice(0, 200), [preview]);
  const busy = sendState === "queued";

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-3 sm:p-4" onClick={() => !busy && onClose()}>
      <section role="dialog" aria-modal="true" aria-labelledby="confirmed-email-title" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto border border-[#e4e3df] bg-[#fafaf8] shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-[#0b0b0b] bg-[#0b0b0b] px-5 py-4 sm:px-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a1a1a1]">Confirmed Orders</div>
            <h2 id="confirmed-email-title" className="mt-1 text-xl font-bold text-white sm:text-2xl">
              Email to warehouse
            </h2>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close email dialog" className="p-1 text-white hover:text-[#d9d9d9]">
            <X size={20} />
          </button>
        </div>
        <div className="grid gap-4 px-5 py-5 sm:px-6">
          <div className="grid gap-1 text-sm font-semibold text-[#0b0b0b]">
            <span>
              Warehouse<span className="text-[#86000B]"> *</span>
            </span>
            <div role="group" aria-label="Warehouse" className="inline-flex h-9 w-fit items-stretch divide-x divide-[#d8d7d2] overflow-hidden rounded-[4px] border border-[#d8d7d2] bg-white" data-testid="email-warehouse">
              {(["mets", "glacier"] as const).map((key) => (
                <button key={key} type="button" aria-pressed={warehouse === key} onClick={() => chooseWarehouse(key)} className={`min-w-[96px] px-4 text-sm! font-semibold ${warehouse === key ? "bg-[#0b0b0b] text-white" : "bg-white text-[#55565a] hover:bg-[#f2f2ef]"}`}>
                  {WAREHOUSE_LABEL[key]}
                </button>
              ))}
            </div>
            {!warehouse && <span className="text-xs font-normal text-[#77787b]">Choose which warehouse's lines this email is about.</span>}
          </div>
          <RecipientField label="To" required chips={to} onChange={setTo} testId="email-to" />
          <RecipientField label="CC" chips={cc} onChange={setCc} testId="email-cc" />
          <label className="grid gap-1 text-sm font-semibold text-[#0b0b0b]">
            Subject
            <input value={subject} onChange={(event) => { subjectTouched.current = true; setSubject(event.target.value); }} className={`${inputClass} w-full font-normal`} />
          </label>
          <div className="grid gap-1 text-sm font-semibold text-[#0b0b0b]">
            Email body (preview)
            {!warehouse ? (
              <div className="border border-dashed border-[#d8d7d2] bg-white px-3 py-6 text-center text-xs font-normal text-[#77787b]">Choose a warehouse to load the email.</div>
            ) : draftLoading ? (
              <div className="flex items-center gap-2 border border-[#e4e3df] bg-white px-3 py-6 text-xs font-normal text-[#55565a]" data-testid="email-draft-loading">
                <Loader2 size={14} className="animate-spin" /> Loading the email...
              </div>
            ) : draftError ? (
              <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border border-[#86000B]/30 bg-[#fff4f4] px-3 py-3 text-xs font-normal text-[#86000B]">
                {draftError}
                <button type="button" onClick={() => void loadDraft(warehouse)} className={buttonClass}>
                  <RefreshCw size={14} /> Retry
                </button>
              </div>
            ) : draft ? (
              <iframe title="Email body preview" sandbox="" srcDoc={draft.htmlBody} data-testid="email-body-preview" className="h-[320px] w-full border border-[#e4e3df] bg-white sm:h-[380px]" />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={openAttachments} disabled={!warehouse || previewing || busy} className={buttonClass} data-testid="preview-attachments">
              {previewing ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />} Preview attachments
            </button>
            <span className="text-xs text-[#77787b]" data-testid="attachment-summary">
              {preview
                ? `${preview.pdf_filename} + ${preview.xlsx_filename} attached (${preview.order_count} order${preview.order_count === 1 ? "" : "s"}, ${preview.line_count} line${preview.line_count === 1 ? "" : "s"}).`
                : `${orderIds.length} order${orderIds.length === 1 ? "" : "s"} selected. Nothing is sent until you press Send.`}
            </span>
          </div>

          {error && (
            <div role="alert" className="border border-[#86000B]/30 bg-[#fff4f4] px-4 py-3 text-sm text-[#86000B]">
              {error}
            </div>
          )}
          {sendState !== "idle" && (
            <div data-testid="email-send-status" className={`flex items-center gap-2 border px-4 py-3 text-sm ${sendState === "sent" ? "border-[#33673B]/30 bg-[#f1f8f2] text-[#33673B]" : sendState === "failed" ? "border-[#86000B]/30 bg-[#fff4f4] text-[#86000B]" : "border-[#d8d7d2] bg-white text-[#55565a]"}`}>
              {sendState === "queued" && <Loader2 size={14} className="animate-spin" />}
              {sendState === "sent" && <CheckCircle2 size={14} />}
              {sendState === "queued" ? "Queued - sending..." : sendState === "sent" ? "Sent." : "Failed."}
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className={buttonClass}>
              {sendState === "sent" ? "Close" : "Cancel"}
            </button>
            <button type="button" onClick={send} disabled={!ready || busy || sendState === "sent"} className={primaryButtonClass} title={!draft ? "Choose a warehouse and wait for the email to load" : !preview ? "Preview the attachments first" : !to.length ? "Add at least one recipient" : undefined}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} {busy ? "Sending..." : sendState === "failed" ? "Retry send" : "Send"}
            </button>
          </div>
        </div>
      </section>
      {attachmentsOpen && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 p-3 sm:p-4" onClick={(event) => { event.stopPropagation(); setAttachmentsOpen(false); }} data-testid="attachment-popup-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="attachment-popup-title" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto border border-[#e4e3df] bg-[#fafaf8] shadow-2xl" onClick={(event) => event.stopPropagation()} data-testid="attachment-popup">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e4e3df] bg-white px-4 py-3">
              <h3 id="attachment-popup-title" className="text-base font-bold">
                Attachment preview{warehouse ? ` - ${WAREHOUSE_LABEL[warehouse]}` : ""}
              </h3>
              <button type="button" onClick={() => setAttachmentsOpen(false)} aria-label="Close attachment preview" className="p-1 hover:text-[#55565a]">
                <X size={18} />
              </button>
            </div>
            <div className="grid gap-3 p-4">
              {previewing && (
                <div className="flex items-center gap-2 text-sm text-[#55565a]">
                  <Loader2 size={14} className="animate-spin" /> Building the attachments...
                </div>
              )}
              {!previewing && !preview && error && (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border border-[#86000B]/30 bg-[#fff4f4] px-3 py-3 text-sm text-[#86000B]">
                  {error}
                  <button type="button" onClick={() => void openAttachments()} className={buttonClass}>
                    <RefreshCw size={14} /> Retry
                  </button>
                </div>
              )}
              {preview && (
                <div className="grid gap-3" data-testid="email-preview">
                  <div className="text-xs text-[#55565a]">
                    {preview.order_count} order{preview.order_count === 1 ? "" : "s"} ({describeCounts(preview.counts_by_type) || "none"}), {preview.line_count} line{preview.line_count === 1 ? "" : "s"} for {WAREHOUSE_LABEL[preview.warehouse]}.
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold">PDF: {preview.pdf_filename}</div>
                    {pdfUrl && <iframe title="PDF preview" src={pdfUrl} className="h-[360px] w-full border border-[#e4e3df] bg-white sm:h-[460px]" />}
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold">Excel: {preview.xlsx_filename}</div>
                    <div className="max-h-[280px] overflow-auto border border-[#e4e3df] bg-white">
                      <table className="w-full min-w-max text-left text-[11px]">
                        <thead className="sticky top-0 bg-[#f7f7f4] text-[10px] uppercase tracking-wide text-[#77787b]">
                          <tr>
                            {preview.headers.map((header) => (
                              <th key={header} className="whitespace-nowrap px-2 py-2 font-semibold">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((row, index) => (
                            <tr key={index} className="border-t border-[#efeeeb]">
                              {row.map((cell, cellIndex) => (
                                <td key={cellIndex} className="whitespace-nowrap px-2 py-1.5">
                                  {cell ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {preview.rows.length > previewRows.length && <div className="mt-1 text-[11px] text-[#77787b]">Showing the first {previewRows.length} of {preview.rows.length} rows; the attachment has all of them.</div>}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-[#e4e3df] bg-white px-4 py-3">
              <button type="button" onClick={() => setAttachmentsOpen(false)} className={buttonClass}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
