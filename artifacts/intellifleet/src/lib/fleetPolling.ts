/** Periodic Fleet reads reuse the GET query. Provider refresh stays a manual action. */
export function startFleetCachePolling(readCached: () => Promise<unknown>): () => void {
  const timer = setInterval(() => {
    void readCached().catch(() => undefined);
  }, 30 * 60 * 1000);
  return () => clearInterval(timer);
}
