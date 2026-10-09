import { useQuery } from "@tanstack/react-query";
import { MailWarning } from "lucide-react";
import * as inventoryApi from "@/services/api/inventory";

/** Red banner when Google rejects the Gmail refresh token: no assignment or comms email can go out until it is re-authorised. */
export function GmailDisconnectedBanner({ className = "" }: { className?: string }) {
  const auth = useQuery({
    queryKey: ["gmail-auth-status"],
    queryFn: inventoryApi.getGmailAuthStatus,
    refetchInterval: 60000, // the backend re-checks Google at most every 5 minutes
    retry: false,
  });
  if (auth.data?.connected !== false) return null; // connected, unknown, or not permitted to know: show nothing rather than a wrong state
  return (
    <div role="alert" data-testid="gmail-disconnected-banner" className={`flex items-start gap-2 border border-[#86000B]/40 bg-[#fff4f4] px-4 py-2.5 text-sm font-medium text-[#86000B] ${className}`}>
      <MailWarning size={16} className="mt-0.5 shrink-0" />
      <div>
        Gmail disconnected — re-authorise. Assignment emails and the Logistics inbox will not work until an admin renews GMAIL_COMMS_REFRESH_TOKEN.
        {auth.data.error && <div className="mt-0.5 text-xs font-normal">{auth.data.error}</div>}
      </div>
    </div>
  );
}
