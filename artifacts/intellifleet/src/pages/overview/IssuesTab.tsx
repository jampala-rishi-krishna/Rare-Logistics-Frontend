import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/overview";
import { agoText, isRange, sentence, type UrlState } from "@/lib/overviewModel";
import {
  buttonClass,
  Chip,
  ErrorLine,
  inputClass,
  primaryButtonClass,
  Skeleton,
  Thumb,
  useNow,
  usePhotoViewer,
} from "./shared";
import { useIssues } from "./queries";
const STATUSES = [
  "submitted",
  "acknowledged",
  "in_progress",
  "resolved",
  "closed",
];
export function IssueCard({
  issue,
  statuses = STATUSES,
  onTrip,
}: {
  issue: api.IssueRow;
  statuses?: string[];
  onTrip: (batch: string, stop?: string) => void;
}) {
  const client = useQueryClient();
  const [status, setStatus] = useState(issue.status);
  const [reply, setReply] = useState(issue.response ?? "");
  const now = useNow(15000);
  const viewer = usePhotoViewer();
  useEffect(() => {
    setStatus(issue.status);
    setReply(issue.response ?? "");
  }, [issue.status, issue.response]);
  const save = useMutation({
    mutationFn: () =>
      api.respondToIssue(issue.id, { status, response: reply.trim() || null }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["driver-overview"] });
    },
  });
  const photos = issue.photos?.length
    ? issue.photos
    : issue.photo_ids.map((id) => ({
        photo_id: id,
        so_number: issue.so_number,
        captured_at: issue.created_at,
        kind: "problem",
      }));
  return (
    <article
      className="min-w-0 rounded-lg border border-border bg-card p-3"
      data-testid={`issue-${issue.reference}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong className="font-mono">{issue.reference}</strong>
        <Chip tone={issue.priority === "normal" ? "neutral" : "bad"}>
          {sentence(issue.priority)}
        </Chip>
        <Chip
          tone={
            issue.status === "closed" || issue.status === "resolved"
              ? "good"
              : "warn"
          }
        >
          {issue.status_label}
        </Chip>
        <span className="text-xs text-muted-foreground">
          {agoText(issue.created_at, now)}
        </span>
      </div>
      <h3 className="mt-2 font-semibold">{sentence(issue.category)}</h3>
      <p className="text-xs text-muted-foreground">
        {issue.reporter.name ?? "Unknown"} ({issue.reporter.role}) ·{" "}
        {issue.vehicle} · {issue.so_number}
      </p>
      {issue.batch_id ? (
        <button
          className="my-1 text-xs underline"
          onClick={() =>
            onTrip(issue.batch_id!, issue.so_id ?? issue.so_number ?? undefined)
          }
        >
          Open trip {issue.vehicle ?? issue.batch_id}
        </button>
      ) : (
        <p className="text-xs text-muted-foreground">Not tied to a trip</p>
      )}
      <p className="my-2 whitespace-pre-wrap break-words text-sm">
        {issue.description}
      </p>
      <div className="flex flex-wrap gap-3">
        {photos.map((p, i) => (
          <Thumb
            key={p.photo_id}
            photo={p}
            onOpen={() => viewer.open(photos, i)}
          />
        ))}
      </div>
      <div className="mt-3 grid gap-2 border-t border-border pt-3">
        <label className="grid gap-1 text-xs font-semibold">
          Status
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {sentence(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Reply to the driver
          <textarea
            aria-label="Reply"
            rows={2}
            maxLength={2000}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            className={`${inputClass} h-auto py-2`}
          />
        </label>
        <button
          className={`${primaryButtonClass} justify-self-start`}
          disabled={
            save.isPending ||
            (status === issue.status &&
              (reply.trim() || null) === (issue.response ?? null))
          }
          onClick={() => save.mutate()}
          data-testid={`issue-save-${issue.reference}`}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
      {save.isError && <ErrorLine error={save.error} />}
      {save.isSuccess && (
        <p role="status" className="mt-2 text-xs">
          {save.data.changed
            ? "Saved. The driver sees it in Alerts."
            : "Nothing changed."}
        </p>
      )}
      {issue.responded_at && (
        <p className="mt-1 text-xs text-muted-foreground">
          Last reply {agoText(issue.responded_at, now)}
          {issue.responded_by ? ` by ${issue.responded_by}` : ""}
        </p>
      )}
      {viewer.node}
    </article>
  );
}
export function DateScope({
  state,
  set,
  label,
}: {
  state: UrlState;
  set: (p: Partial<UrlState>) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-muted-foreground">
        {state.only && !isRange(state) ? `Only ${state.date}` : label}
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={state.only && !isRange(state)}
          disabled={isRange(state)}
          onChange={(e) => set({ only: e.target.checked })}
        />
        Only this date
        {isRange(state) && (
          <span className="text-xs text-muted-foreground">
            (switch to a single day)
          </span>
        )}
      </label>
    </div>
  );
}
export default function IssuesTab({
  state,
  set,
}: {
  state: UrlState;
  set: (p: Partial<UrlState>) => void;
}) {
  const [show, setShow] = useState("open");
  const query = useIssues(state, show);
  return (
    <section className="grid min-w-0 gap-3" data-testid="issues-tab">
      <DateScope state={state} set={set} label="All open issues — all dates" />
      <div
        role="group"
        aria-label="Show issues"
        className="flex flex-wrap gap-1"
      >
        {["open", "all", "resolved", "closed"].map((s) => (
          <button
            key={s}
            className={buttonClass}
            aria-pressed={show === s}
            onClick={() => setShow(s)}
          >
            {sentence(s)}
          </button>
        ))}
      </div>
      {query.isLoading ? (
        <Skeleton className="h-48" />
      ) : query.isError ? (
        <ErrorLine error={query.error} onRetry={() => void query.refetch()} />
      ) : !query.data?.issues.length ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm">
          No issues to show.
        </p>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {query.data.issues.map((i) => (
            <IssueCard
              key={i.id}
              issue={i}
              statuses={query.data.statuses}
              onTrip={(trip, stop) => set({ trip, stop: stop ?? "" })}
            />
          ))}
        </div>
      )}
    </section>
  );
}
