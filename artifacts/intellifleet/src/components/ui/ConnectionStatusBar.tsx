import { RefreshCw } from "lucide-react";
import { degradedText, listQueryView, type ListQueryView } from "@/lib/queryStatus";

/** Minimal slice of a react-query result this needs (keeps it usable with any query). */
export interface ListQueryLike {
  data: unknown;
  isError: boolean;
  isFetching: boolean;
  dataUpdatedAt: number;
}

/** Reads the optional `stale` / `stale_since` fields the backend adds to a cached 200 response. */
export function viewOfQuery(query: ListQueryLike): ListQueryView {
  const data = (query.data ?? null) as { stale?: boolean | null; stale_since?: string | null } | null;
  return listQueryView({
    hasData: query.data !== undefined && query.data !== null,
    isError: query.isError,
    isFetching: query.isFetching,
    dataUpdatedAt: query.dataUpdatedAt,
    stale: data?.stale,
    staleSince: data?.stale_since,
  });
}

/**
 * Amber "Reconnecting… showing data from 13:42" bar shown ABOVE rows that are still on screen, when a
 * refetch failed or the server says the data is stale. Renders nothing when everything is live.
 */
export function ConnectionStatusBar({ view, isFetching = false, onRetry }: { view: ListQueryView; isFetching?: boolean; onRetry?: () => void }) {
  if (view.mode !== "degraded") return null;
  return (
    <div
      role="status"
      data-testid="connection-status-bar"
      data-reason={view.reason}
      className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-[#e8d29a] bg-[#fff8e6] px-4 py-2 text-xs text-[#7a5600]"
    >
      <span className="min-w-0">{degradedText(view, isFetching)}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isFetching}
          className="inline-flex shrink-0 items-center gap-1 rounded-[4px] border border-[#d9b85c] bg-white px-2 py-1 font-semibold disabled:opacity-60"
        >
          <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} /> Retry
        </button>
      )}
    </div>
  );
}
