import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as overviewApi from "@/services/api/overview";
import { timeAgo } from "@/lib/overview";
import { PRIORITY_TONE } from "@/lib/overviewView";
import { Chip, Empty, ErrorNote, Skeleton, buttonClass, inputClass, primaryButtonClass } from "./shared";
import type { TopFilter } from "./LiveTab";

const SHOW: Array<[string, string]> = [
  ["open", "Open"],
  ["all", "All"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
];

function IssueCard({ issue, statuses }: { issue: overviewApi.IssueRow; statuses: string[] }) {
  const client = useQueryClient();
  const [status, setStatus] = useState(issue.status);
  const [reply, setReply] = useState(issue.response ?? "");
  const save = useMutation({
    mutationFn: () => overviewApi.respondToIssue(issue.id, { status, response: reply.trim() || null }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["overview-issues"] });
      void client.invalidateQueries({ queryKey: ["overview-summary"] });
    },
  });
  const label = (s: string) => s.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <article className="border border-[#e4e3df] bg-white p-3" data-testid={`issue-${issue.reference}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold">{issue.reference}</span>
        <Chip tone={PRIORITY_TONE[issue.priority] ?? "neutral"}>{issue.priority}</Chip>
        <Chip tone={issue.status === "resolved" || issue.status === "closed" ? "good" : issue.status === "submitted" ? "warn" : "info"}>{issue.status_label}</Chip>
        <span className="text-xs text-[#77787b]">{timeAgo(issue.created_at)}</span>
      </div>
      <div className="mt-1 text-sm font-bold">{issue.category}</div>
      <div className="text-xs text-[#55565a]">
        {issue.reporter.name ?? "Unknown"} ({issue.reporter.role}) {issue.vehicle ? `· ${issue.vehicle}` : ""} {issue.so_number ? `· ${issue.so_number}` : ""} {issue.batch_id ? "" : "· not tied to a trip"}
        {issue.photo_ids.length > 0 ? ` · ${issue.photo_ids.length} photo(s)` : ""}
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{issue.description}</p>
      <div className="mt-3 grid gap-2 border-t border-[#efeeeb] pt-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <label className="grid gap-1 text-xs font-semibold">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass} aria-label="Status">
            {statuses.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold">
          Reply to the driver
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={2000} className={`${inputClass} py-1.5`} aria-label="Reply" />
        </label>
        <button type="button" disabled={save.isPending || (status === issue.status && (reply.trim() || null) === (issue.response ?? null))} onClick={() => save.mutate()} className={primaryButtonClass} data-testid={`issue-save-${issue.reference}`}>
          {save.isPending ? "Saving..." : "Save"}
        </button>
      </div>
      {save.isError && <p className="mt-1 text-xs font-semibold text-[#86000B]">Could not save. Try again.</p>}
      {save.isSuccess && <p className="mt-1 text-xs font-semibold text-[#1e7b44]">{save.data.changed ? "Saved. The driver sees it in Alerts." : "Nothing changed."}</p>}
      {issue.responded_at && <p className="mt-1 text-[11px] text-[#77787b]">Last reply {timeAgo(issue.responded_at)}{issue.responded_by ? ` by ${issue.responded_by}` : ""}</p>}
    </article>
  );
}

export default function IssuesTab({ filter }: { filter: TopFilter }) {
  const [show, setShow] = useState("open");
  const issues = useQuery({ queryKey: ["overview-issues", show], queryFn: () => overviewApi.getIssues(show), refetchInterval: 15_000, refetchIntervalInBackground: false });
  const needle = filter.search.trim().toLowerCase();
  const list = (issues.data?.issues ?? []).filter((i) => !needle || [i.reference, i.category, i.description, i.reporter.name, i.vehicle, i.so_number].some((v) => String(v ?? "").toLowerCase().includes(needle)));
  return (
    <section className="grid gap-3" data-testid="issues-tab">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Show issues">
        {SHOW.map(([v, l]) => (
          <button key={v} type="button" aria-pressed={show === v} onClick={() => setShow(v)} className={`${buttonClass} ${show === v ? "!border-black !bg-black !text-white" : ""}`}>
            {l}
          </button>
        ))}
      </div>
      {issues.isLoading ? (
        <Skeleton className="h-32" />
      ) : issues.isError ? (
        <ErrorNote error={issues.error} onRetry={() => void issues.refetch()} />
      ) : list.length === 0 ? (
        <Empty>No issues to show.</Empty>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {list.map((i) => (
            <IssueCard key={`${i.id}-${i.status}-${i.responded_at ?? ""}`} issue={i} statuses={issues.data?.statuses ?? ["submitted", "acknowledged", "in_progress", "resolved", "closed"]} />
          ))}
        </div>
      )}
    </section>
  );
}
