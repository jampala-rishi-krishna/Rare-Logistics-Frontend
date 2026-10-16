// Shared HTTP client for every services/api/*.ts module.
// Error classification, retry policy and the 401 guard are pure helpers in src/lib/apiErrors.ts (tested there).

import {
  classifyStatus,
  createSessionExpiryGuard,
  extractRequestId,
  runWithRetries,
  userMessage,
  type ApiErrorKind,
  type AttemptOutcome,
} from "@/lib/apiErrors";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
export const SESSION_STORAGE_KEY = "if-access-token";

export function getStoredSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredSessionId(token: string) {
  localStorage.setItem(SESSION_STORAGE_KEY, token);
  sessionExpiry.reset();
}

export function clearStoredSessionId() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem("if-last-role");
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  kind: ApiErrorKind;
  requestId: string | null;
  constructor(status: number, message: string, body?: unknown, extra: { kind?: ApiErrorKind; requestId?: string | null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.kind = extra.kind ?? classifyStatus(status, body);
    this.requestId = extra.requestId ?? extractRequestId(body);
  }
}

// Single-flight session expiry: the first 401 (from any request, the CSV export or the fleet socket)
// clears the session and redirects once; later ones are no-ops and new requests fail fast.
export const sessionExpiry = createSessionExpiryGuard({
  clearSession: clearStoredSessionId,
  redirect: (path) => window.location.assign(path),
  pathname: () => window.location.pathname,
});

/** Called on a 401 (or a WebSocket 4401). Safe to call any number of times. */
export function handleUnauthorized(requestPath?: string) {
  sessionExpiry.trigger(requestPath);
}

function redirectingError() {
  return new ApiError(401, "Your session has expired. Redirecting to sign in…", null, { kind: "unauthorized" });
}

function buildUrl(path: string, query?: Record<string, string | number | undefined>) {
  if (!API_BASE_URL) {
    throw new Error("VITE_API_BASE_URL is not configured");
  }
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function authHeaders(): Record<string, string> {
  const token = getStoredSessionId();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Turns a failed response into an ApiError (and handles 401). Used by request, download and raw fetches. */
export function toApiError(method: string, path: string, outcome: AttemptOutcome, timeoutMs?: number): ApiError {
  const kind = classifyStatus(outcome.status, outcome.body);
  const requestId = extractRequestId(outcome.body, outcome.headers);
  const message = userMessage(kind, { status: outcome.status, body: outcome.body, requestId, timeoutMs });
  // Technical detail for developers only; the user sees `message`.
  const log = kind === "network" || kind === "server" || kind === "stale" ? console.error : console.warn;
  log(`[api] ${method} ${path} failed: kind=${kind} status=${outcome.status}${requestId ? ` request_id=${requestId}` : ""}`, outcome.networkError ?? outcome.body);
  if (kind === "unauthorized") handleUnauthorized(path);
  return new ApiError(outcome.status, message, outcome.body, { kind, requestId });
}

/** For modules that must use fetch directly (blobs): throws the same ApiError + 401 handling as api.*. */
export async function ensureOk(res: Response, method: string, path: string): Promise<Response> {
  if (res.ok) return res;
  const body = await parseResponse(res).catch(() => null);
  throw toApiError(method, path, { status: res.status, ok: false, body, headers: res.headers });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function request<T>(
  method: string,
  path: string,
  options: { query?: Record<string, string | number | undefined>; body?: unknown; isFormData?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  if (sessionExpiry.redirecting) throw redirectingError();
  const url = buildUrl(path, options.query);
  const headers: Record<string, string> = authHeaders();
  let body: BodyInit | undefined;

  if (options.body !== undefined && !options.isFormData) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  } else if (options.isFormData) {
    body = options.body as FormData;
  }

  const attempt = async (): Promise<AttemptOutcome> => {
    if (sessionExpiry.redirecting) throw redirectingError();
    const controller = new AbortController();
    const timeout = options.timeoutMs ? window.setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      const data = await parseResponse(res);
      return { status: res.status, ok: res.ok, body: data, headers: res.headers };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.warn(`[api] ${method} ${path} timed out after ${options.timeoutMs} ms`);
        throw new ApiError(0, userMessage("timeout", { timeoutMs: options.timeoutMs }), null, { kind: "timeout" });
      }
      if (error instanceof TypeError) {
        // Offline, DNS, server down or a CORS rejection - fetch can't tell them apart.
        return { status: 0, ok: false, body: null, networkError: error };
      }
      throw error;
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
    }
  };

  const { outcome } = await runWithRetries(attempt, {
    method,
    sleep,
    onRetry: ({ kind, status, delayMs, retry }) =>
      console.warn(`[api] ${method} ${path}: ${kind} (status ${status}), retry ${retry} in ${delayMs} ms`),
  });

  if (!outcome.ok) throw toApiError(method, path, outcome, options.timeoutMs);
  return outcome.body as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | undefined>) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, query?: Record<string, string | number | undefined>, timeoutMs?: number) => request<T>("POST", path, { body, query, timeoutMs }),
  postForm: <T>(path: string, form: FormData) => request<T>("POST", path, { body: form, isFormData: true }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
  download: async (path: string, query?: Record<string, string | number | undefined>) => {
    if (sessionExpiry.redirecting) throw redirectingError();
    const url = buildUrl(path, query);
    let res: Response;
    try {
      res = await fetch(url, { headers: authHeaders() });
    } catch (error) {
      if (error instanceof TypeError) throw toApiError("GET", path, { status: 0, ok: false, body: null, networkError: error });
      throw error;
    }
    await ensureOk(res, "GET", path);
    return { blob: await res.blob(), filename: res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "sales-orders" };
  },
};

export function isApiConfigured() {
  return Boolean(API_BASE_URL);
}
