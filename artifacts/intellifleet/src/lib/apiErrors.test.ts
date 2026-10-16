import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_GET_RETRIES,
  classifyError,
  classifyStatus,
  clientRetryDelayMs,
  createSessionExpiryGuard,
  extractRequestId,
  queryShouldRetry,
  runWithRetries,
  shouldClientRetry,
  signInPathFor,
  userMessage,
} from "./apiErrors.ts";
import type { AttemptOutcome } from "./apiErrors.ts";

const headers = (map: Record<string, string>) => ({ get: (name: string) => map[name] ?? map[name.toLowerCase()] ?? null });

test("statuses classify into kinds", () => {
  assert.equal(classifyStatus(0), "network");
  assert.equal(classifyStatus(401), "unauthorized");
  assert.equal(classifyStatus(403), "forbidden");
  assert.equal(classifyStatus(429), "rate_limited");
  assert.equal(classifyStatus(500, { detail: "Server error", request_id: "r1" }), "server");
  assert.equal(classifyStatus(502, "<html>Bad gateway</html>"), "server");
  assert.equal(classifyStatus(503, { code: "warming" }), "warming");
  assert.equal(classifyStatus(503, { detail: "Zoho is unavailable", stale: true }), "stale");
  assert.equal(classifyStatus(503, { detail: "x" }), "server");
  assert.equal(classifyStatus(429, { code: "zoho_budget", detail: "budget guard" }), "budget");
  assert.equal(classifyStatus(503, { detail: { code: "zoho_budget", message: "budget guard" } }), "budget");
  assert.equal(classifyStatus(422, { detail: "bad" }), "client");
});

test("thrown errors classify: TypeError is network, ApiError-like uses kind/status", () => {
  assert.equal(classifyError(new TypeError("Failed to fetch")), "network");
  assert.equal(classifyError({ status: 401, body: null }), "unauthorized");
  assert.equal(classifyError({ kind: "stale", status: 503 }), "stale");
  assert.equal(classifyError(new Error("plain")), null);
});

test("5xx: request id comes from the body, else the X-Request-ID header", () => {
  assert.equal(extractRequestId({ detail: "Server error", request_id: "abc123" }, headers({ "X-Request-ID": "hdr" })), "abc123");
  assert.equal(extractRequestId(null, headers({ "X-Request-ID": "hdr-9" })), "hdr-9");
  assert.equal(extractRequestId("<html/>", headers({})), null);
  assert.equal(userMessage("server", { status: 500, body: { detail: "Server error" }, requestId: "abc123" }), "IntelliFleet server hit a problem. (Ref: abc123)");
});

test("network message is user-facing, never the old CORS wording", () => {
  const message = userMessage("network", { requestId: null });
  assert.equal(message, "IntelliFleet server didn't respond.");
  assert.doesNotMatch(message, /CORS/);
  assert.equal(userMessage("network", { requestId: "r-7" }), "IntelliFleet server didn't respond. (Ref: r-7)");
});

test("server-provided messages survive for 4xx, stale and budget", () => {
  assert.equal(userMessage("client", { status: 422, body: { detail: "Date is required" } }), "Date is required");
  assert.equal(userMessage("stale", { body: { detail: "Zoho is unavailable", stale: true }, requestId: "q" }), "Zoho is unavailable (Ref: q)");
  assert.equal(userMessage("budget", { body: { detail: "Zoho budget guard: paused" } }), "Zoho budget guard: paused");
});

test("client retry policy: GETs retry transient failures only, non-GET never (except one 429)", () => {
  assert.equal(shouldClientRetry("network", 0, "GET", 0), true);
  assert.equal(shouldClientRetry("server", 502, "GET", 1), true);
  assert.equal(shouldClientRetry("server", 503, "GET", MAX_GET_RETRIES), false);
  assert.equal(shouldClientRetry("rate_limited", 429, "GET", 0), true);
  for (const kind of ["unauthorized", "forbidden", "client", "budget", "stale", "warming"] as const) {
    assert.equal(shouldClientRetry(kind, 400, "GET", 0), false, kind);
  }
  assert.equal(shouldClientRetry("network", 0, "POST", 0), false);
  assert.equal(shouldClientRetry("server", 500, "PATCH", 0), false);
  assert.equal(shouldClientRetry("rate_limited", 429, "POST", 0), true);
  assert.equal(shouldClientRetry("rate_limited", 429, "POST", 1), false);
});

test("retry delay is exponential with equal jitter and capped", () => {
  assert.equal(clientRetryDelayMs(0, () => 0), 250);
  assert.equal(clientRetryDelayMs(0, () => 1), 500);
  assert.equal(clientRetryDelayMs(1, () => 0), 500);
  assert.equal(clientRetryDelayMs(1, () => 1), 1000);
  assert.equal(clientRetryDelayMs(10, () => 1), 4000);
});

const fail = (status: number, body: unknown = null): AttemptOutcome => ({ status, ok: false, body });

test("network failure: GET follows the retry schedule, then gives up with the network outcome", async () => {
  let calls = 0;
  const slept: number[] = [];
  const { outcome, attempts } = await runWithRetries(async () => (calls++, fail(0)), { method: "GET", sleep: async (ms) => void slept.push(ms), random: () => 0.5 });
  assert.equal(attempts, MAX_GET_RETRIES + 1);
  assert.equal(calls, MAX_GET_RETRIES + 1);
  assert.deepEqual(slept, [375, 750]);
  assert.equal(outcome.status, 0);
});

test("a GET that recovers returns the success outcome", async () => {
  const outcomes = [fail(503), { status: 200, ok: true, body: { items: [] } }];
  const { outcome, attempts } = await runWithRetries(async () => outcomes.shift()!, { method: "GET", sleep: async () => {} });
  assert.equal(attempts, 2);
  assert.deepEqual(outcome.body, { items: [] });
});

test("POST network failure is not retried; 401 is not retried", async () => {
  let calls = 0;
  await runWithRetries(async () => (calls++, fail(0)), { method: "POST", sleep: async () => {} });
  assert.equal(calls, 1);
  calls = 0;
  await runWithRetries(async () => (calls++, fail(401)), { method: "GET", sleep: async () => {} });
  assert.equal(calls, 1);
});

test("react-query never retries 4xx and adds at most one pass for transient errors", () => {
  assert.equal(queryShouldRetry(0, { status: 401 }), false);
  assert.equal(queryShouldRetry(0, { status: 403 }), false);
  assert.equal(queryShouldRetry(0, { status: 404 }), false);
  assert.equal(queryShouldRetry(0, { status: 429, body: { code: "zoho_budget" } }), false);
  assert.equal(queryShouldRetry(0, { kind: "network", status: 0 }), true);
  assert.equal(queryShouldRetry(1, { kind: "network", status: 0 }), false);
  assert.equal(queryShouldRetry(5, { status: 503, body: { code: "warming" } }), true);
  assert.equal(queryShouldRetry(20, { status: 503, body: { code: "warming" } }), false);
});

function guardHarness(pathname = "/app/load-planning") {
  const calls = { clear: 0, redirects: [] as string[] };
  const guard = createSessionExpiryGuard({
    clearSession: () => void calls.clear++,
    redirect: (path) => void calls.redirects.push(path),
    pathname: () => pathname,
  });
  return { guard, calls };
}

test("401: concurrent failures clear the session and redirect exactly once", async () => {
  const { guard, calls } = guardHarness();
  const results = await Promise.all(Array.from({ length: 8 }, async (_, i) => guard.trigger(`/api/list/${i}`)));
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(calls.clear, 1);
  assert.deepEqual(calls.redirects, ["/login"]);
  assert.equal(guard.redirecting, true);
});

test("401 on the sign-in call or on the sign-in page never redirects", () => {
  const a = guardHarness();
  assert.equal(a.guard.trigger("/auth/login"), false);
  assert.equal(a.calls.redirects.length, 0);
  const b = guardHarness("/login");
  assert.equal(b.guard.trigger("/auth/session"), false);
  assert.equal(b.guard.redirecting, false);
});

test("drivers are sent to the driver sign-in; reset re-arms the guard", () => {
  const { guard, calls } = guardHarness("/driver/today");
  guard.trigger();
  guard.trigger();
  assert.deepEqual(calls.redirects, ["/driver/login"]);
  guard.reset();
  guard.trigger();
  assert.equal(calls.redirects.length, 2);
  assert.equal(signInPathFor("/app"), "/login");
});
