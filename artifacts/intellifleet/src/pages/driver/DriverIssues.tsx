import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";
import { timeAgo } from "@/lib/overview";
import { issueStatusTone } from "@/lib/issues";
import DriverLayout from "./DriverLayout";
import { useIssuesQuery } from "./queries";
import { ErrorState, Skeleton, errorText, useDriverMe, useDriverScope } from "./shared";

// The reporter's own issues with dispatch's answers. Read-only: an issue is changed only by dispatch.
export default function DriverIssues() {
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const issues = useIssuesQuery(scope);
  const list = issues.data?.issues ?? [];
  return (
    <DriverLayout scope={scope} name={me.data?.name ?? null}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight">My reported issues</h1>
      </div>
      <Link href="/driver/issues/new" data-testid="driver-issues-new" className="mt-4 inline-flex min-h-[52px] w-full items-center justify-center gap-2 bg-black text-sm font-bold !text-white">
        <AlertTriangle size={18} />
        Report an issue
      </Link>
      <div className="mt-4">
        {issues.isLoading ? (
          <div className="grid gap-3" aria-busy="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : issues.isError && list.length === 0 ? (
          <ErrorState message={errorText(issues.error)} onRetry={() => void issues.refetch()} />
        ) : list.length === 0 ? (
          <p data-testid="driver-issues-empty" className="border border-[#e4e3df] bg-white p-6 text-center text-sm font-semibold">
            You have not reported any issues.
          </p>
        ) : (
          <ul className="grid gap-3" data-testid="driver-issues-list">
            {list.map((i) => (
              <li key={i.id} className="border border-[#e4e3df] bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-semibold text-[#77787b]">{i.reference}</div>
                    <div className="break-words text-base font-bold">{i.category}</div>
                  </div>
                  <span className={`inline-flex shrink-0 border px-2 py-0.5 text-[11px] font-bold ${issueStatusTone(i.status)}`}>{i.status_label}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm">{i.description}</p>
                <div className="mt-2 text-xs text-[#55565a]">
                  {i.priority !== "normal" ? `${i.priority[0].toUpperCase()}${i.priority.slice(1)} priority · ` : ""}
                  {i.vehicle ? `${i.vehicle} · ` : ""}
                  {i.so_number ? `${i.so_number} · ` : ""}
                  {timeAgo(i.created_at)}
                </div>
                {i.response && (
                  <div className="mt-3 border-l-2 border-black bg-[#fafaf8] p-3 text-sm" data-testid="driver-issue-response">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#77787b]">Dispatch replied {timeAgo(i.responded_at)}</div>
                    <p className="mt-1 whitespace-pre-wrap break-words">{i.response}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DriverLayout>
  );
}
