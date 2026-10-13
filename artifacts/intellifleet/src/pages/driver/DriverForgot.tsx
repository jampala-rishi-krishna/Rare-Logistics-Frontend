import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Phone } from "lucide-react";
import * as authApi from "@/services/api/auth";
import { telHref } from "@/lib/driver";

// Password resets in this system are single-use links issued by dispatch / an admin (Admin > Users). There is no self-service e-mail
// reset, so this screen says exactly that and gives the real dispatch number (the DISPATCH_PHONE setting) - nothing is sent from here.
export default function DriverForgot() {
  const support = useQuery({ queryKey: ["driver-support"], queryFn: () => authApi.getSupport(), retry: 1, staleTime: 5 * 60 * 1000 });
  const phone = support.data?.dispatch_phone ?? null;
  const tel = telHref(phone);
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#f2f2ef] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(1.5rem+env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-[420px]">
        <Link href="/driver/login" className="inline-flex min-h-[48px] items-center gap-2 text-sm font-semibold">
          <ArrowLeft size={18} />
          Back to sign in
        </Link>
        <h1 className="mt-4 text-3xl font-bold leading-tight">Forgot your password?</h1>
        <ol className="mt-5 grid gap-3 text-sm leading-6 text-[#33343a]">
          <li className="border border-[#e4e3df] bg-white p-4">
            <span className="font-bold">1. Ask dispatch for a reset link.</span> Dispatch sends you a one-time link by message or email. It is valid for 24 hours.
          </li>
          <li className="border border-[#e4e3df] bg-white p-4">
            <span className="font-bold">2. Open the link</span> on this phone and choose a new password (at least 8 characters).
          </li>
          <li className="border border-[#e4e3df] bg-white p-4">
            <span className="font-bold">3. Sign in</span> with your phone number or email and the new password.
          </li>
        </ol>
        {tel ? (
          <a href={tel} data-testid="driver-forgot-call" className="mt-6 inline-flex min-h-[56px] w-full items-center justify-center gap-2 bg-black px-6 text-base font-bold !text-white">
            <Phone size={18} />
            Call dispatch {phone ? `(${phone})` : ""}
          </a>
        ) : (
          <p data-testid="driver-forgot-nophone" className="mt-6 border border-[#e6c36a] bg-[#fff6dd] p-3 text-sm font-semibold text-[#6b4a00]">
            {support.isLoading ? "Loading the dispatch number..." : "The dispatch number is not set up. Ask your supervisor to contact dispatch for a reset link."}
          </p>
        )}
      </div>
    </div>
  );
}
