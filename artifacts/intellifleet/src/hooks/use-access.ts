import { useQuery } from "@tanstack/react-query";
import { getSession } from "@/services/api/auth";

export function useAccess() {
  const session = useQuery({ queryKey: ["access-session"], queryFn: getSession, staleTime: 30_000, refetchInterval: 60_000 });
  const user = session.data?.user;
  const readOnly = !user || ["sales", "wet_market"].includes(user.role);
  return { user, readOnly, manager: Boolean(user?.is_manager) && !readOnly, ready: Boolean(user) };
}
