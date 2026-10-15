import { useQuery } from "@tanstack/react-query";
import * as authApi from "@/services/api/auth";
import { telHref } from "@/lib/driver";
import { useT } from "./i18n";
import { C, FONT, Icon, RoundButton, SAFE_BOTTOM } from "./ui";

// Password resets are single-use links issued by dispatch / an admin. There is no self-service reset, so this screen
// says so and gives the real dispatch number (the DISPATCH_PHONE setting) - nothing is sent from here.
export default function DriverForgot() {
  const t = useT();
  const support = useQuery({ queryKey: ["driver-support"], queryFn: () => authApi.getSupport(), retry: 1, staleTime: 5 * 60 * 1000 });
  const phone = support.data?.dispatch_phone ?? null;
  const tel = telHref(phone);
  const steps = [t.forgotStep1, t.forgotStep2, t.forgotStep3];
  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: FONT, color: C.ink, overflowX: "hidden" }}>
      <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", minHeight: "100dvh", boxSizing: "border-box", display: "flex", flexDirection: "column", padding: `calc(16px + env(safe-area-inset-top)) 20px ${SAFE_BOTTOM(32)}` }}>
        <RoundButton icon="back" label={t.backToSignIn} href="/driver/login" filled={false} />
        <h1 style={{ margin: "24px 0 20px", fontSize: 30, lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.03em" }}>{t.forgotTitle}</h1>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ background: C.card, borderRadius: 18, padding: 16, display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ width: 36, height: 36, borderRadius: 18, background: C.ink, color: C.card, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>{s}</div>
            </div>
          ))}
        </div>
        <div style={{ flexGrow: 1, minHeight: 32 }} />
        {tel ? (
          <a href={tel} data-testid="driver-forgot-call" style={{ height: 60, borderRadius: 16, background: C.ink, color: C.card, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 18, fontWeight: 700 }}>
            <Icon name="phone" size={22} color={C.onInk} />
            {t.callDispatch}
          </a>
        ) : (
          <p data-testid="driver-forgot-nophone" style={{ margin: 0, padding: "12px 14px", borderRadius: 14, background: C.amberBg, color: C.amber, fontSize: 14, fontWeight: 500 }}>
            {support.isLoading ? t.loading : t.noDispatchNumber}
          </p>
        )}
      </div>
    </div>
  );
}
