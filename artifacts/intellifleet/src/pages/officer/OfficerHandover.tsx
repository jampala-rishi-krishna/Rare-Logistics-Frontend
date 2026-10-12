import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import * as officerApi from "@/services/api/officer";
import {
  alreadyDoneText,
  buildValidatePayload,
  errorInfo,
  newActionBase,
  noteRequired,
  personName,
  validationState,
  type Decisions,
} from "@/lib/officer";
import OfficerLayout, { EmptyBox, ErrorBox, LoadingBox, Notice, StatusPill, fmtDate, fmtDateTime, useOfficerSession } from "./shared";

type Choice = "received" | "missing" | "discrepancy";
const CHOICES: Array<{ value: Choice; label: string; on: string }> = [
  { value: "received", label: "Received", on: "border-[#1e7b44] bg-[#1e7b44] text-white" },
  { value: "missing", label: "Missing", on: "border-[#c4291f] bg-[#c4291f] text-white" },
  { value: "discrepancy", label: "Discrepancy", on: "border-[#a16819] bg-[#a16819] text-white" },
];

export default function OfficerHandover() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const session = useOfficerSession();
  const [decisions, setDecisions] = useState<Decisions>({});
  const [notice, setNotice] = useState<{ tone: "good" | "warn" | "bad"; text: string } | null>(null);
  const query = useQuery({
    queryKey: ["officer", "handover", id],
    queryFn: () => officerApi.getHandover(id),
    enabled: Boolean(id),
    retry: 1,
  });
  const detail = query.data;
  const items = detail?.items ?? [];
  const itemIds = useMemo(() => items.map((i) => String(i.item_id)), [items]);
  const stopsBySo = useMemo(() => new Map((detail?.stops ?? []).map((s) => [s.so_number, s])), [detail?.stops]);
  // Editable only while the handover is waiting for its first validation and the user may act.
  const editable = Boolean(detail) && detail!.status === "pending" && !session.readOnly;
  const state = validationState(itemIds, decisions);

  const submit = useMutation({
    mutationFn: () => officerApi.validateHandover(id, newActionBase(), buildValidatePayload(itemIds, decisions)),
    onSuccess: async (result) => {
      const dup = alreadyDoneText(result);
      setNotice(dup ? { tone: "warn", text: dup } : { tone: "good", text: "Validation submitted." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["officer"] }),
        queryClient.invalidateQueries({ queryKey: ["driver-overview"] }),
      ]);
    },
    onError: (error) => {
      const info = errorInfo(error);
      setNotice({ tone: "bad", text: info.fieldErrors.length ? `${info.message} (${info.fieldErrors.map((f) => f.message).join("; ")})` : info.message });
    },
  });

  const setChoice = (itemId: string, status: Choice) =>
    setDecisions((prev) => ({ ...prev, [itemId]: { status, note: prev[itemId]?.note ?? "" } }));
  const setNote = (itemId: string, note: string) =>
    setDecisions((prev) => ({ ...prev, [itemId]: { status: prev[itemId]?.status ?? null, note } }));

  return (
    <OfficerLayout title="Validate handover">
      <Link href="/officer/pending" className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold">
        <ArrowLeft size={16} />
        Back to pending
      </Link>
      {query.isLoading ? (
        <LoadingBox label="Loading handover..." />
      ) : query.isError ? (
        <ErrorBox error={query.error} onRetry={() => void query.refetch()} />
      ) : !detail ? (
        <EmptyBox>Handover not found.</EmptyBox>
      ) : (
        <div className="grid gap-4">
          <section className="border border-[#e4e3df] bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[#77787b]">{fmtDate(detail.delivery_date)}</div>
                <div className="font-mono text-xl font-bold">{detail.vehicle ?? "No vehicle"}</div>
              </div>
              <StatusPill status={detail.status} />
            </div>
            <div className="mt-3 grid gap-1 text-sm">
              <div>
                <span className="text-[#77787b]">Driver: </span>
                <span className="font-semibold">{detail.driver?.name ?? "-"}</span>
              </div>
              {detail.helpers.length > 0 && (
                <div>
                  <span className="text-[#77787b]">Helpers: </span>
                  {detail.helpers.map(personName).join(", ")}
                </div>
              )}
              <div className="text-xs text-[#77787b]">Submitted {fmtDateTime(detail.submitted_at)}</div>
            </div>
          </section>

          {session.readOnly && <Notice tone="warn">Read-only view. Only logistics officers can validate invoices.</Notice>}
          {!session.readOnly && detail.status !== "pending" && (
            <Notice tone="good">
              {detail.status === "closed" ? "This handover is fully validated and closed." : "This handover was validated. Items that are not received stay open under Outstanding."}
            </Notice>
          )}
          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

          {items.length === 0 ? (
            <EmptyBox>This handover has no invoices.</EmptyBox>
          ) : (
            <div className="grid gap-3">
              {items.map((item) => {
                const key = String(item.item_id);
                const d = decisions[key];
                const stop = stopsBySo.get(item.so_number);
                const needNote = editable && d?.status && noteRequired(d.status) && d.note.trim() === "";
                return (
                  <article key={key} className="border border-[#e4e3df] bg-white p-4" data-testid={`invoice-${key}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-base font-bold">{item.so_number}</div>
                        <div className="break-words text-sm text-[#55565a]">{item.customer_name ?? "-"}</div>
                      </div>
                      {!editable && <StatusPill status={item.officer_status ?? "pending"} />}
                    </div>
                    <div className="mt-3 grid gap-1 text-sm">
                      <div>
                        <span className="text-[#77787b]">Crew says: </span>
                        <span className={`font-semibold ${item.handed_over === false ? "text-[#86000B]" : ""}`}>
                          {item.handed_over === null ? "no answer" : item.handed_over ? "handed over" : "not handed over"}
                        </span>
                        {item.crew_note && <span className="break-words text-[#55565a]"> - {item.crew_note}</span>}
                      </div>
                      <div>
                        <span className="text-[#77787b]">Delivery outcome: </span>
                        <span className="font-semibold">{stop?.outcome ?? "-"}</span>
                        {stop?.reason && <span className="break-words text-[#55565a]"> - {stop.reason}</span>}
                      </div>
                    </div>
                    {editable ? (
                      <div className="mt-4 grid gap-3">
                        <div className="grid grid-cols-3 gap-2" role="group" aria-label={`Status for ${item.so_number}`}>
                          {CHOICES.map((c) => (
                            <button
                              key={c.value}
                              type="button"
                              aria-pressed={d?.status === c.value}
                              onClick={() => setChoice(key, c.value)}
                              className={`min-h-[52px] border px-2 text-sm font-bold ${d?.status === c.value ? c.on : "border-[#d8d7d2] bg-white"}`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                        <label className="grid gap-1 text-xs font-semibold">
                          Note{d?.status && noteRequired(d.status) ? " (required)" : " (optional)"}
                          <textarea
                            rows={2}
                            value={d?.note ?? ""}
                            onChange={(e) => setNote(key, e.target.value)}
                            className={`border bg-white p-2 text-sm font-normal outline-none focus:border-black ${needNote ? "border-[#c4291f]" : "border-[#d8d7d2]"}`}
                          />
                        </label>
                      </div>
                    ) : (
                      <div className="mt-3 border-t border-[#efeeeb] pt-3 text-sm">
                        {item.officer_note && <div className="break-words">Officer note: {item.officer_note}</div>}
                        {item.checked_at && (
                          <div className="text-xs text-[#77787b]">
                            Checked {fmtDateTime(item.checked_at)}
                            {personName(item.checked_by) ? ` by ${personName(item.checked_by)}` : ""}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {editable && items.length > 0 && (
            <div className="sticky bottom-0 -mx-4 border-t border-[#e4e3df] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-[#55565a]">
                  {state.decided} of {state.total} invoices have a status
                  {state.needsNote.length > 0 ? ` - ${state.needsNote.length} need a note` : ""}
                </div>
                <button
                  type="button"
                  disabled={!state.canSubmit || submit.isPending}
                  onClick={() => {
                    setNotice(null);
                    submit.mutate();
                  }}
                  data-testid="officer-submit"
                  className="min-h-[52px] w-full bg-black px-6 text-sm font-bold text-white disabled:opacity-40 sm:w-auto"
                >
                  {submit.isPending ? "Submitting..." : "Acknowledge & submit"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </OfficerLayout>
  );
}
