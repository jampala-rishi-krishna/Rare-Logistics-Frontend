# Rare Logistics Frontend deployment

Cloudflare Pages:

- Root directory: blank / repository root
- Build command: `pnpm install --frozen-lockfile && pnpm --filter @workspace/intellifleet run build`
- Output directory: `artifacts/intellifleet/dist/public`
- Environment: `NODE_VERSION=20`, `VITE_API_BASE_URL`, `VITE_CARTRACK_WS_URL`, `VITE_GOOGLE_MAPS_API_KEY`
- SPA fallback: `artifacts/intellifleet/public/_redirects`

The backend is deployed separately from `backend/` using its own repository and Render configuration.
