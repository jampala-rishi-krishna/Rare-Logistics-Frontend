// The page's filters live in the URL (?date&from&to&wh&q&tile&trip&tab&stop&view&only) so links, reload and Back work.
import { useCallback, useEffect, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { manilaDate } from "@/lib/overview";
import { migrateLegacySearch, parseUrlState, toSearch } from "@/lib/overviewModel";
import type { UrlState } from "@/lib/overviewModel";

export function useOverviewUrl() {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const today = manilaDate();
  const state = useMemo(() => parseUrlState(search, today), [search, today]);

  // Old Overview links (?section=trips etc.) -> the new params, once, without a history entry.
  useEffect(() => {
    const migrated = migrateLegacySearch(search, today);
    if (migrated !== null) navigate(`${location}${migrated}`, { replace: true });
  }, [search, today, location, navigate]);

  const set = useCallback(
    (patch: Partial<UrlState>, opts: { replace?: boolean } = {}) => {
      const next = { ...parseUrlState(window.location.search, today), ...patch };
      if (!next.trip) next.stop = "";
      const qs = toSearch(next, today);
      if (qs === window.location.search || (qs === "" && window.location.search === "")) return;
      navigate(`${location}${qs}`, { replace: opts.replace ?? false });
    },
    [location, navigate, today],
  );

  return { state, set, today };
}
