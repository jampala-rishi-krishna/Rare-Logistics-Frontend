# Deploy: backend HTTP / WebSocket hardening

Full Render and Cloudflare steps live in `backend/DEPLOY_STEPS.md`. This page covers the CORS, error and memory
settings added on 2026-10-16. No database tables or columns are involved.

## Start command

`render.yaml` now starts `python -m uvicorn main:asgi_app ...`. `main:asgi_app` is `main:app` wrapped in an outer
CORS fallback, so even a 500 produced by Starlette's ServerErrorMiddleware reaches the browser with CORS headers.

The Render dashboard Start Command overrides `render.yaml` when set. Change it to `main:asgi_app` there as well.
If it stays on `main:app`, the app is still safe: a global exception handler returns the same JSON 500 and adds
CORS headers itself.

## Environment variables

- `CORS_ALLOWED_ORIGINS`: exact frontend origins, comma-separated, no wildcard. Example:
  `https://rare-logistics-frontend.rishi-315.workers.dev,https://rare-logistics-frontend.pages.dev`.
  Whitespace and trailing `/` are stripped. When unset, the older `ALLOWED_ORIGINS` is used (production currently
  uses that name and keeps working without changes).
- `CORS_ALLOW_ORIGIN_REGEX`: optional, default none. The only accepted value is
  `^https://([a-z0-9-]+\.)?rare-logistics-frontend\.(rishi-315\.workers|pages)\.dev$`
  (covers Cloudflare Pages preview subdomains). Any other value stops startup; `*` is never allowed because
  credentials are allowed.
- `MEMORY_DEBUG_LOG`: `1` logs process RSS every 60 s (and wherever code calls `memory_debug.log_rss(tag)`).
  Default off. `/health` always includes `rss_mb`.

## Behaviour

- Every HTTP response has `X-Request-ID` (an incoming sane value is kept, otherwise a 16-char id is minted), exposed
  to the browser through `Access-Control-Expose-Headers`.
- Unhandled errors: `500 {"detail": "Server error", "code": "internal_error", "request_id": "..."}`. Database errors
  add `"error": "Database operation failed"`. The traceback is logged with the request id; exception text is never
  returned.
- `/health` is `async` and memory-only, so a saturated threadpool (blocking Zoho calls) cannot make it hang and get
  the instance restarted.
- `/ws/fleet` always accepts first, then:
  - closes with `4403` for a browser Origin that is not allowed (a missing Origin is allowed for non-browser clients);
  - closes with `4401` ("token expired") when `?token=` is present but invalid/expired;
  - without `?token=` the socket is still accepted (backward compatible with the currently deployed frontend);
  - if starting the Cartrack poller fails, sends `{"type": "status", "cartrack": "unavailable"}` and stays open; the
    next connection retries the poller start.
