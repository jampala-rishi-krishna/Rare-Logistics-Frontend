// Pure error classification + retry policy for the shared HTTP client (src/services/api/client.ts).
// No window / import.meta here so it runs under `node --test`.

export type ApiErrorKind =
  | "network" // fetch never got a response (offline, DNS, CORS, server down)
  | "timeout" // the client aborted after timeoutMs
  | "unauthorized" // 401
  | "forbidden" // 403
  | "rate_limited" // 429 (not the Zoho budget guard)
  | "budget" // 429/503 with code "zoho_budget": an expected pause, never retried
  | "warming" // 503 {code: "warming"}: server is filling its Zoho cache
  | "stale" // 503 {stale: true}: upstream outage and no cached data to serve
  | "server" // any other 5xx
  | "client"; // any other 4xx

export interface HeaderLike {
  get(name: string): string | null;
}

export const RETRYING_MESSAGE = "Can't reach the IntelliFleet server right now. Retrying…";
export const NO_RESPONSE_MESSAGE = "IntelliFleet server didn't respond.";
export const SERVER_ERROR_MESSAGE = "IntelliFleet server hit a problem.";

function asRecord(body: unknown): Record<string, unknown> | null {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** `code` from the body, at the top level or inside `detail` (FastAPI HTTPException(detail={...})). */
export function errorCode(body: unknown): string | null {
  const obj = asRecord(body);
  if (!obj) return null;
  if (typeof obj.code === "string") return obj.code;
  const detail = asRecord(obj.detail);
  return detail && typeof detail.code === "string" ? detail.code : null;
}

function bodyFlag(body: unknown, key: string): unknown {
  const obj = asRecord(body);
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  const detail = asRecord(obj.detail);
  return detail ? detail[key] : undefined;
}

export function classifyStatus(status: number, body?: unknown): ApiErrorKind {
  if (status === 0) return "network";
  const code = errorCode(body);
  if (code === "zoho_budget" && (status === 429 || status === 503)) return "budget";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 429) return "rate_limited";
  if (status === 503 && code === "warming") return "warming";
  if (status === 503 && bodyFlag(body, "stale") === true) return "stale";
  if (status >= 500) return "server";
  return "client";
}

/** Classifies anything thrown by fetch / the client into a kind (TypeError = network). */
export function classifyError(error: unknown): ApiErrorKind | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { kind?: unknown; status?: unknown; body?: unknown; name?: unknown };
  if (typeof e.kind === "string") return e.kind as ApiErrorKind;
  if (typeof e.status === "number") return classifyStatus(e.status, e.body);
  if (error instanceof TypeError) return "network";
  if (e.name === "AbortError") return "timeout";
  return null;
}

/** Request id from the JSON body (`request_id`) or, failing that, the X-Request-ID response header. */
export function extractRequestId(body: unknown, headers?: HeaderLike | null): string | null {
  const obj = asRecord(body);
  const fromBody = obj && (obj.request_id ?? asRecord(obj.detail)?.request_id);
  if (typeof fromBody === "string" && fromBody) return fromBody;
  const fromHeader = headers?.get("X-Request-ID") ?? headers?.get("x-request-id") ?? null;
  return fromHeader || null;
}

/** The server-provided human message, if any (this backend's {error}/{detail} and Catalyst's {data:{message}}). */
export function serverMessage(body: unknown): string | null {
  const obj = asRecord(body);
  if (!obj) return typeof body === "string" && body.trim() && body.length < 300 && !body.trimStart().startsWith("<") ? body.trim() : null;
  if (typeof obj.error === "string") return obj.error;
  if (typeof obj.message === "string") return obj.message;
  const detail = asRecord(obj.detail);
  if (detail && typeof detail.message === "string") return detail.message;
  if (typeof obj.detail === "string") return obj.detail;
  const nested = asRecord(obj.data);
  if (nested && typeof nested.message === "string") return nested.message;
  return null;
}

export function withRef(message: string, requestId: string | null | undefined): string {
  return requestId ? `${message} (Ref: ${requestId})` : message;
}

/** The message a user sees for a failed request. Technical detail belongs in the console, not here. */
export function userMessage(kind: ApiErrorKind, opts: { status?: number; body?: unknown; requestId?: string | null; timeoutMs?: number } = {}): string {
  const fromServer = serverMessage(opts.body);
  switch (kind) {
    case "network":
      return withRef(NO_RESPONSE_MESSAGE, opts.requestId);
    case "timeout":
      return `Request timed out after ${Math.round((opts.timeoutMs ?? 0) / 1000)} seconds. The server may still be processing; please try again.`;
    case "rate_limited":
      return fromServer || "Too many requests right now - please wait a moment and try again.";
    case "server":
      // A generic 500 says only "Server error": replace it with our own wording plus the reference.
      return withRef(fromServer && !/^(server error|internal server error)$/i.test(fromServer) ? fromServer : SERVER_ERROR_MESSAGE, opts.requestId);
    case "stale":
      return withRef(fromServer || "Live data is temporarily unavailable.", opts.requestId);
    case "warming":
      return fromServer || "The server is still loading data from Zoho. Please wait a moment.";
    case "budget":
      return fromServer || "Zoho budget guard: live Zoho calls are paused for now.";
    case "unauthorized":
      return fromServer || "Your session has expired. Please sign in again.";
    default:
      return fromServer || `Request failed (HTTP ${opts.status ?? "?"})`;
  }
}

// ---- Retry policy ---------------------------------------------------------------------------

/** GETs are retried this many times (so up to MAX_GET_RETRIES + 1 attempts) by the client itself. */
export const MAX_GET_RETRIES = 2;
const RETRY_BASE_MS = 500;
const RETRY_CAP_MS = 4000;

/**
 * Whether the client should retry this outcome itself. Only idempotent GETs, and only for
 * transient failures. A 429 for a non-GET is the one exception: a rate-limit rejection means the
 * request never ran, so one retry is safe (keeps the old "Optimize Fleet" behaviour).
 */
export function shouldClientRetry(kind: ApiErrorKind, status: number, method: string, retriesSoFar: number): boolean {
  const isGet = method.toUpperCase() === "GET";
  if (!isGet) return kind === "rate_limited" && retriesSoFar < 1;
  if (retriesSoFar >= MAX_GET_RETRIES) return false;
  if (kind === "network" || kind === "rate_limited") return true;
  return kind === "server" && [500, 502, 503, 504].includes(status);
}

/** Exponential backoff with equal jitter: half fixed, half random. attempt is 0-based. */
export function clientRetryDelayMs(retryIndex: number, random: () => number = Math.random): number {
  const exp = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** retryIndex);
  return Math.round(exp / 2 + random() * (exp / 2));
}

export interface AttemptOutcome {
  /** 0 when fetch threw a network error (no response). */
  status: number;
  ok: boolean;
  body: unknown;
  headers?: HeaderLike | null;
  networkError?: unknown;
}

/**
 * Runs `attempt` until it succeeds, a non-retryable outcome comes back, or retries are used up.
 * `attempt` returns status 0 for network failures; anything it throws (timeouts) propagates unretried.
 */
export async function runWithRetries(
  attempt: () => Promise<AttemptOutcome>,
  opts: { method: string; sleep: (ms: number) => Promise<void>; random?: () => number; onRetry?: (info: { kind: ApiErrorKind; status: number; delayMs: number; retry: number }) => void },
): Promise<{ outcome: AttemptOutcome; attempts: number }> {
  let retries = 0;
  for (;;) {
    const outcome = await attempt();
    if (outcome.ok) return { outcome, attempts: retries + 1 };
    const kind = classifyStatus(outcome.status, outcome.body);
    if (!shouldClientRetry(kind, outcome.status, opts.method, retries)) return { outcome, attempts: retries + 1 };
    // A 429 waits a bit longer: the gateway's concurrency window is ~1-2 s.
    const delayMs = kind === "rate_limited" ? 1500 + clientRetryDelayMs(retries, opts.random) : clientRetryDelayMs(retries, opts.random);
    opts.onRetry?.({ kind, status: outcome.status, delayMs, retry: retries + 1 });
    await opts.sleep(delayMs);
    retries += 1;
  }
}

/**
 * react-query retry decision. The client already retries GETs for network/5xx, so the query layer adds
 * at most one more pass for those; 4xx (401/403/validation) and the budget guard are never retried;
 * warming keeps polling quietly (every 3 s, up to ~1 minute).
 */
export function queryShouldRetry(failureCount: number, error: unknown): boolean {
  const kind = classifyError(error);
  if (kind === "warming") return failureCount < 20;
  if (kind === null) return failureCount < 1;
  if (kind === "network" || kind === "server" || kind === "rate_limited" || kind === "timeout") return failureCount < 1;
  return false;
}

export function queryRetryDelayMs(failureCount: number, error: unknown): number {
  return classifyError(error) === "warming" ? 3000 : Math.min(2000 * 2 ** failureCount, 30000);
}

// ---- Single-flight session expiry -----------------------------------------------------------

export function signInPathFor(pathname: string): string {
  return pathname.startsWith("/driver") ? "/driver/login" : "/login";
}

/**
 * One guard per page load: the first 401 clears the session and redirects; every later 401 (from
 * concurrent requests, the CSV export, or the fleet socket) is a no-op, and new requests are rejected
 * immediately while the redirect is in flight.
 */
export function createSessionExpiryGuard(deps: { clearSession: () => void; redirect: (path: string) => void; pathname: () => string }) {
  let redirecting = false;
  return {
    get redirecting() {
      return redirecting;
    },
    /** Returns true when this call started the redirect. `requestPath` = API path that returned 401. */
    trigger(requestPath?: string): boolean {
      if (redirecting) return false;
      // A failed sign-in is a 401 too: it must show its error on the sign-in screen, never navigate.
      if (requestPath === "/auth/login") return false;
      const pathname = deps.pathname();
      const target = signInPathFor(pathname);
      if (pathname === target) return false;
      redirecting = true;
      deps.clearSession();
      deps.redirect(target);
      return true;
    },
    reset() {
      redirecting = false;
    },
  };
}
