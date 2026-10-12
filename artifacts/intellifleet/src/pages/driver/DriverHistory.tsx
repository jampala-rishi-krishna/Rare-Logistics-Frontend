import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import * as driverApi from "@/services/api/driver";
import { formatKg, formatShortDate, validateDateRange, withDriverParams } from "@/lib/driver";
import DriverLayout from "./DriverLayout";
import { ErrorState, MissingDriverNotice, Skeleton, StatusBadge, errorText, useDriverMe, useDriverScope } from "./shared";

type Mode = "7" | "30" | "custom";

export default function DriverHistory() {
  const scope = useDriverScope();
  const me = useDriverMe(scope);
  const [mode, setMode] = useState<Mode>("7");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string } | null>(null);
  const [rangeError, setRangeError] = useState("");

  const range: driverApi.HistoryRange | null =
    mode === "7" ? { days: 7 } : mode === "30" ? { days: 30 } : applied ? applied : null;
  const enabled = !scope.sessionLoading && !scope.missingDriverId && range !== null;
  const history = useQuery({
    queryKey: ["driver-history", scope.adminDriverId, range],
    queryFn: () => driverApi.getHistory(range as driverApi.HistoryRange, scope.adminDriverId),
    enabled,
    retry: 1,
  });

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateDateRange(fromInput, toInput);
    if (problem) {
      setRangeError(problem);
      return;
    }
    setRangeError("");
    setApplied({ from: fromInput, to: toInput });
  };

  const chip = (value: Mode, label: string) => (
    <button
      type="button"
      key={value}
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`min-h-[44px] border px-4 text-sm font-semibold ${mode === value ? "border-black bg-black text-white" : "border-[#d8d7d2] bg-white"}`}
    >
      {label}
    </button>
  );

  return (
    <DriverLayout scope={scope} name={me.data?.name ?? null}>
      <h1 className="text-2xl font-bold leading-tight">History</h1>
      {scope.missingDriverId ? (
        <div className="mt-4">
          <MissingDriverNotice />
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {chip("7", "Last 7 days")}
            {chip("30", "Last 30 days")}
            {chip("custom", "Custom range")}
          </div>

          {mode === "custom" && (
            <form onSubmit={apply} className="mt-3 grid gap-3 border border-[#e4e3df] bg-white p-4">
              <label className="grid gap-1 text-sm font-semibold">
                From
                <input
                  type="date"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  className="min-h-[48px] w-full border border-[#d8d7d2] bg-white px-3 text-base"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold">
                To
                <input
                  type="date"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  className="min-h-[48px] w-full border border-[#d8d7d2] bg-white px-3 text-base"
                />
              </label>
              {rangeError && (
                <p role="alert" className="text-sm text-[#c4291f]">
                  {rangeError}
                </p>
              )}
              <button type="submit" className="min-h-[48px] bg-black px-6 text-sm font-semibold text-white">
                Apply
              </button>
            </form>
          )}

          <div className="mt-4">
            {!range ? (
              <p className="text-sm text-[#55565a]">Choose a start and end date, then tap Apply.</p>
            ) : history.isLoading ? (
              <div className="grid gap-3" aria-busy="true">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : history.isError ? (
              <ErrorState message={errorText(history.error)} onRetry={() => void history.refetch()} />
            ) : history.data && history.data.batches.length === 0 ? (
              <div className="border border-[#e4e3df] bg-white p-6 text-center text-sm font-semibold">No past assignments in this range.</div>
            ) : (
              <div className="grid gap-3">
                {history.data?.batches.map((batch) => {
                  const href = withDriverParams(`/driver/assignment/${encodeURIComponent(batch.batch_id)}`, {
                    from: "history",
                    driver_id: scope.adminDriverId,
                  });
                  return (
                    <Link
                      key={batch.batch_id}
                      href={href}
                      data-testid={`driver-history-${batch.batch_id}`}
                      className="block min-h-[44px] border border-[#e4e3df] bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-bold">{formatShortDate(batch.delivery_date)}</div>
                          <div className="mt-0.5 font-mono text-base font-semibold">{batch.vehicle}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={batch.email_status ?? batch.assignment_status} />
                          <ChevronRight size={20} className="text-[#77787b]" />
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-[#55565a]">
                        {batch.so_count} {batch.so_count === 1 ? "order" : "orders"} &middot; {formatKg(batch.total_kg)}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </DriverLayout>
  );
}
