import type { QueryClient } from "@tanstack/react-query";

// Invalidation only; every refetch still passes through that screen's authorization.
export function refreshTripQueries(client: QueryClient) {
  return client.invalidateQueries({
    predicate: (q) => {
      const key = String(q.queryKey[0] ?? "");
      return (
        key.startsWith("driver-") ||
        key.startsWith("order-tracker") ||
        key === "officer"
      );
    },
  });
}
