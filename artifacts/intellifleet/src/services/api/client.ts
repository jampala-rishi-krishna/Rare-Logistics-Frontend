// Shared HTTP client for every services/api/*.ts module.

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined;
const SESSION_STORAGE_KEY = "if-access-token";

export function getStoredSessionId(): string | null {
  return localStorage.getItem(SESSION_STORAGE_KEY);
}

export function setStoredSessionId(token: string) {
  localStorage.setItem(SESSION_STORAGE_KEY, token);
}

export function clearStoredSessionId() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
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

async function parseResponse(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// Extracts a real, human-readable message from an error response body. Handles both this
// backend's own shape ({error: "..."}) and Catalyst's platform-level error shape (e.g. rate
// limiting: {status:"failure", data:{message, error_code}}), which the old code didn't
// recognize - a 429 "Concurrency limit reached" from the API Gateway itself (before a request
// even reaches a function) used to silently degrade to the unhelpful generic "Request failed".
function extractErrorMessage(data: unknown, res: Response): string {
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.message === "string") return obj.message;
    if (obj.detail && typeof obj.detail === "object" && typeof (obj.detail as Record<string, unknown>).message === "string") {
      return (obj.detail as Record<string, unknown>).message as string;
    }
    if (typeof obj.detail === "string") return obj.detail;
    const nested = obj.data;
    if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>).message === "string") {
      return (nested as Record<string, unknown>).message as string;
    }
  }
  if (res.status === 429) return "Too many requests right now - please wait a moment and try again.";
  return res.statusText || `Request failed (HTTP ${res.status})`;
}

async function request<T>(
  method: string,
  path: string,
  options: { query?: Record<string, string | number | undefined>; body?: unknown; isFormData?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const url = buildUrl(path, options.query);
  const headers: Record<string, string> = {};
  const token = getStoredSessionId();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  let body: BodyInit | undefined;

  if (options.body !== undefined && !options.isFormData) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  } else if (options.isFormData) {
    body = options.body as FormData;
  }

  // Concurrency-limit responses (429) are transient by nature - one short retry clears most of
  // them without the caller needing its own retry logic, especially for a long-running call
  // like fleet optimization where making the dispatcher click "Optimize Fleet" again is poor UX.
  const attempt = async () => {
    const controller = new AbortController();
    const timeout = options.timeoutMs ? window.setTimeout(() => controller.abort(), options.timeoutMs) : undefined;
    try {
      const res = await fetch(url, { method, headers, body, signal: controller.signal });
      const data = await parseResponse(res);
      return { res, data };
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
    }
  };

  let { res, data } = await attempt();
  if (res.status === 429) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    ({ res, data } = await attempt());
  }

  if (!res.ok) {
    if (res.status === 401 && window.location.pathname !== "/login") {
      clearStoredSessionId();
      window.location.assign("/login");
    }
    throw new ApiError(res.status, extractErrorMessage(data, res), data);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, string | number | undefined>) => request<T>("GET", path, { query }),
  post: <T>(path: string, body?: unknown, query?: Record<string, string | number | undefined>, timeoutMs?: number) => request<T>("POST", path, { body, query, timeoutMs }),
  postForm: <T>(path: string, form: FormData) => request<T>("POST", path, { body: form, isFormData: true }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  download: async (path: string, query?: Record<string, string | number | undefined>) => {
    const url = buildUrl(path, query);
    const res = await fetch(url, { headers: getStoredSessionId() ? { Authorization: `Bearer ${getStoredSessionId()}` } : {} });
    if (!res.ok) throw new ApiError(res.status, `Download failed (HTTP ${res.status})`);
    return { blob: await res.blob(), filename: res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "sales-orders" };
  },
};

export function isApiConfigured() {
  return Boolean(API_BASE_URL);
}
