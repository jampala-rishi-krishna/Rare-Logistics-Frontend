import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Truck } from "lucide-react";
import * as authApi from "@/services/api/auth";
import { ApiError, clearStoredSessionId, getStoredSessionId, setStoredSessionId } from "@/services/api/client";
import { postLoginRoute } from "@/lib/roles";
import { loginErrorText } from "@/lib/driver";

const field = "min-h-[52px] w-full border border-[#d8d7d2] bg-white px-3 text-base outline-none focus:border-black";

// Driver / helper sign-in: phone number or email + password. Same /auth/login as every other role (throttling and
// "generic error" behaviour are server-side); this screen only adds show/hide, clear errors and the Forgot password route.
export default function DriverLogin() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
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
      setError("Enter your phone number or email, and your password.");
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
        setError("This account has no workspace assigned. Contact dispatch.");
      } else setLocation(target);
    } catch (e) {
      setError(loginErrorText(e instanceof ApiError ? e.status : null, e instanceof ApiError ? e.message : null));
    } finally {
      setBusy(false);
    }
  };

  if (checking) return <div className="flex min-h-[100dvh] items-center justify-center bg-[#f2f2ef] text-sm text-[#77787b]">Checking session...</div>;

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-hidden bg-[#f2f2ef] px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-[calc(2.5rem+env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col">
        <div className="mt-6 text-center">
          <Truck size={44} className="mx-auto" aria-hidden="true" />
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Rare Logistics</h1>
          <p className="mt-1 text-sm text-[#55565a]">Driver App</p>
        </div>
        <form className="mt-10 grid gap-4" onSubmit={submit} noValidate>
          <label className="grid gap-1.5 text-sm font-semibold">
            Phone number or email
            <input
              data-testid="driver-login-identifier"
              type="text"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="09xx xxx xxxx or name@email.com"
              className={field}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">
            Password
            <span className="relative block">
              <input
                data-testid="driver-login-password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${field} pr-14`}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
                aria-pressed={show}
                data-testid="driver-login-toggle"
                className="absolute right-0 top-0 inline-flex h-[52px] w-[52px] items-center justify-center text-[#55565a]"
              >
                {show ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </span>
          </label>
          {error && (
            <p role="alert" data-testid="driver-login-error" className="border border-[#f0c4c7] bg-[#fff1f2] p-3 text-sm font-semibold text-[#86000B]">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} data-testid="driver-login-submit" className="inline-flex min-h-[56px] w-full items-center justify-center bg-black px-6 text-base font-bold !text-white disabled:opacity-60">
            {busy ? "Signing in..." : "Sign in"}
          </button>
          <Link href="/driver/forgot-password" data-testid="driver-forgot-link" className="inline-flex min-h-[48px] items-center justify-center text-sm font-semibold underline underline-offset-2">
            Forgot password?
          </Link>
        </form>
        <p className="mt-auto pt-10 text-center text-xs text-[#77787b]">Rare Global Food Trading Corp.</p>
      </div>
    </div>
  );
}
