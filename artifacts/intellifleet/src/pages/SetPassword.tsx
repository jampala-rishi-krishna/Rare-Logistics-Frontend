import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import * as authApi from "@/services/api/auth";
import { ApiError, clearStoredSessionId, getStoredSessionId } from "@/services/api/client";
import { routeForRole } from "@/lib/roles";

// The invite / reset token is read once from the URL and immediately stripped from the address
// bar. It is kept in a module variable (not state) so React StrictMode's double render, which
// would otherwise see the already-stripped URL, still finds it. It is never logged.
let capturedToken: string | null = null;

function captureTokenFromUrl(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("token");
    if (fromUrl) {
      capturedToken = fromUrl;
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  } catch {
    /* ignore */
  }
  return capturedToken;
}

const MIN_LENGTH = 8;

function validateNew(password: string, confirm: string): string | null {
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (password !== confirm) return "The two passwords do not match.";
  return null;
}

const inputClass =
  "min-h-[48px] w-full border border-[#d8d7d2] bg-white px-3 py-3 text-base outline-none focus:border-black";
const primaryButton =
  "inline-flex min-h-[48px] w-full items-center justify-center bg-black px-6 py-3 text-sm font-semibold text-white disabled:opacity-60";

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#f2f2ef] px-5 py-8">
      <div className="mx-auto w-full max-w-[420px]">
        <div className="text-lg font-bold tracking-tight">IntelliFleet</div>
        <h1 className="mt-8 text-3xl font-bold leading-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

function TokenForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const problem = validateNew(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await authApi.setPassword(token, password);
      capturedToken = null;
      setDone(true);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 429
          ? "Too many attempts. Please try again later."
          : e instanceof ApiError
            ? e.message || "This link is invalid or has expired. Ask dispatch to send a new one."
            : "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Frame title="Password saved">
        <p className="text-sm leading-6 text-[#55565a]">Your password has been set. You can now sign in.</p>
        <Link href="/login" data-testid="set-password-to-login" className={`${primaryButton} mt-6`}>
          Go to sign in
        </Link>
      </Frame>
    );
  }

  return (
    <Frame title="Set your password">
      <p className="mb-5 text-sm leading-6 text-[#55565a]">Choose a password of at least {MIN_LENGTH} characters.</p>
      <form className="grid gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm font-semibold">
          New password
          <input
            data-testid="input-new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Confirm new password
          <input
            data-testid="input-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-[#c4291f]">
            {error}
          </p>
        )}
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving..." : "Save password"}
        </button>
      </form>
    </Frame>
  );
}

function ForcedChangeForm() {
  const [, setLocation] = useLocation();
  const [state, setState] = useState<"loading" | "form" | "none">("loading");
  const [role, setRole] = useState("");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    if (!getStoredSessionId()) {
      setState("none");
      return;
    }
    authApi
      .getSession()
      .then(({ user }) => {
        if (!active) return;
        if (!user.mustChangePassword) {
          setLocation(routeForRole(user.role));
          return;
        }
        setRole(user.role);
        setState("form");
      })
      .catch(() => {
        clearStoredSessionId();
        if (active) setState("none");
      });
    return () => {
      active = false;
    };
  }, [setLocation]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const problem = validateNew(password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setSaving(true);
    try {
      await authApi.changePassword(current, password);
      setLocation(routeForRole(role));
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 429
          ? "Too many attempts. Please try again later."
          : e instanceof ApiError
            ? e.message || "Could not change the password."
            : "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (state === "loading") {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f2f2ef] text-sm text-[#77787b]">
        Loading...
      </div>
    );
  }

  if (state === "none") {
    return (
      <Frame title="Link not valid">
        <p className="text-sm leading-6 text-[#55565a]">
          This page needs a password link from dispatch, or you need to be signed in. Ask dispatch to send you a new link, or sign in.
        </p>
        <Link href="/login" className={`${primaryButton} mt-6`}>
          Go to sign in
        </Link>
      </Frame>
    );
  }

  return (
    <Frame title="Choose a new password">
      <p className="mb-5 text-sm leading-6 text-[#55565a]">
        You need to change your password before continuing. Enter your current password, then a new one of at least {MIN_LENGTH} characters.
      </p>
      <form className="grid gap-4" onSubmit={submit}>
        <label className="grid gap-2 text-sm font-semibold">
          Current password
          <input
            data-testid="input-current-password"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          New password
          <input
            data-testid="input-new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          Confirm new password
          <input
            data-testid="input-confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-[#c4291f]">
            {error}
          </p>
        )}
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving..." : "Change password"}
        </button>
      </form>
    </Frame>
  );
}

export default function SetPassword() {
  const [token] = useState<string | null>(() => captureTokenFromUrl());
  return token ? <TokenForm token={token} /> : <ForcedChangeForm />;
}
