import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import * as authApi from "@/services/api/auth";
import { ApiError, clearStoredSessionId, getStoredSessionId, setStoredSessionId } from "@/services/api/client";
import { postLoginRoute } from "@/lib/roles";
import { greetingPart } from "@/lib/driver";
import { useLang, useT } from "./i18n";
import type { Dict } from "./i18n";
import { C, FONT, Icon, SAFE_BOTTOM } from "./ui";
import rareLogo from "@/assets/driver/rare-logo.jpg";

const input: CSSProperties = {
  height: 56,
  borderRadius: 14,
  border: `1px solid ${C.field}`,
  background: C.card,
  padding: "0 16px",
  fontSize: 18,
  fontFamily: "inherit",
  color: C.ink,
  width: "100%",
  boxSizing: "border-box",
  outline: "none",
};

function loginError(t: Dict, status: number | null, serverMessage: string | null): string {
  if (status === 401 || status === 400) return t.loginWrong;
  if (status === 429) return t.loginTooMany;
  if (status === 403) return serverMessage && /disabled/i.test(serverMessage) ? t.loginDisabled : t.loginNoAccess;
  if (status === null) return t.loginOffline;
  return t.loginFailed;
}

// Driver / helper sign-in. Same POST /auth/login as every role (throttling and the generic 401 are server-side). The
// backend accepts the phone number (or the email) as the identifier, so the field is labelled "Phone number" as designed.
export default function DriverLogin() {
  const t = useT();
  const [lang, setLang] = useLang();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errorKey, setErrorKey] = useState<keyof Dict | null>(null);
  const setError = (value: string) => setErrorKey((Object.keys(t) as Array<keyof Dict>).find(k => t[k] === value) ?? null);
  const error = errorKey ? String(t[errorKey]) : "";
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(() => Boolean(getStoredSessionId()));

  useEffect(() => {
    if (!getStoredSessionId()) return;
    let active = true;
    authApi
      .getSession()
      .then(({ user }) => {
        if (!active) return;
        const target = postLoginRoute(user);
        if (target === "/login") {
          clearStoredSessionId();
          setChecking(false);
        } else setLocation(target);
      })
      .catch(() => {
        clearStoredSessionId();
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [setLocation]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!identifier.trim() || !password) {
      setError(t.loginEmpty);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const result = await authApi.login(identifier.trim(), password);
      queryClient.clear();
      setStoredSessionId(result.token);
      const target = postLoginRoute(result.user);
      if (target === "/login") {
        clearStoredSessionId();
        setError(t.loginNoWorkspace);
      } else setLocation(target);
    } catch (e) {
      setError(loginError(t, e instanceof ApiError ? e.status : null, e instanceof ApiError ? e.message : null));
    } finally {
      setBusy(false);
    }
  };

  const part = greetingPart(new Date().getHours());
  const hello = part === "morning" ? t.greetMorning : part === "afternoon" ? t.greetAfternoon : t.greetEvening;

  if (checking)
    return <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: FONT, color: C.sub, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{t.checkingSession}</div>;

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, fontFamily: FONT, color: C.ink, overflowX: "hidden" }}>
      <form
        onSubmit={submit}
        noValidate
        style={{ width: "100%", maxWidth: 560, margin: "0 auto", minHeight: "100dvh", boxSizing: "border-box", display: "flex", flexDirection: "column", padding: `calc(72px + env(safe-area-inset-top)) 24px ${SAFE_BOTTOM(32)}` }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={rareLogo} alt="Rare Global Food" style={{ width: 94, height: 48, objectFit: "contain", borderRadius: 8 }} />
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{t.appName}</div>
        </div>
        <h1 style={{ margin: "56px 0 8px", fontSize: 34, lineHeight: 1.1, fontWeight: 700, letterSpacing: "-0.03em" }}>
          {hello}
          <br />
          {t.letsRoll}
        </h1>
        <p style={{ margin: "0 0 36px", fontSize: 16, color: C.sub }}>{t.signInWith}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, fontWeight: 500 }}>
            {t.phoneNumber}
            <input
              data-testid="driver-login-identifier"
              type="text"
              inputMode="tel"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder={t.phonePlaceholder}
              style={input}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14, fontWeight: 500 }}>
            {t.password}
            <span style={{ position: "relative", display: "block" }}>
              <input data-testid="driver-login-password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...input, paddingRight: 64 }} />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? t.hidePassword : t.showPassword}
                aria-pressed={show}
                data-testid="driver-login-toggle"
                style={{ position: "absolute", right: 0, top: 0, height: 56, width: 56, border: 0, background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                  {show && <path d="M3 3l18 18" />}
                </svg>
              </button>
            </span>
          </label>
          {error && (
            <p role="alert" data-testid="driver-login-error" style={{ margin: 0, padding: "12px 14px", borderRadius: 14, background: C.negativeBg, color: C.so, fontSize: 14, fontWeight: 700 }}>
              {error}
            </p>
          )}
        </div>
        <div style={{ flexGrow: 1, minHeight: 32 }} />
        <button
          type="submit"
          disabled={busy}
          data-testid="driver-login-submit"
          style={{ height: 60, borderRadius: 16, background: C.ink, color: C.card, border: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 18, fontWeight: 700, fontFamily: "inherit", opacity: busy ? 0.6 : 1, cursor: "pointer" }}
        >
          {busy ? t.signingIn : t.signIn}
          {!busy && <Icon name="arrowRight" size={22} color={C.onInk} />}
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 18, fontSize: 14, color: C.sub }}>
          <Link href="/driver/forgot-password" data-testid="driver-forgot-link" style={{ color: C.sub, minHeight: 44, display: "flex", alignItems: "center" }}>
            {t.forgotCallDispatch}
          </Link>
          <button
            type="button"
            data-testid="driver-lang-toggle"
            aria-label={lang === "en" ? t.tagalog : t.english}
            onClick={() => setLang(lang === "en" ? "tl" : "en")}
            style={{ height: 44, padding: "0 14px", borderRadius: 22, border: `1px solid ${C.field}`, background: C.card, fontFamily: "inherit", fontSize: 14, fontWeight: 500, color: C.ink, flexShrink: 0, cursor: "pointer" }}
          >
            <span style={{ fontWeight: lang === "en" ? 700 : 400 }}>{t.langCodeEn}</span> · <span style={{ fontWeight: lang === "tl" ? 700 : 400 }}>{t.langCodeTl}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
