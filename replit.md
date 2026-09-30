# IntelliFleet Logistics Platform

Light-first connected logistics operations demo for RGF with mocked fleet movement, role-based workflows, and a public product experience.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/intellifleet/src/App.tsx` — route map, mocked entities, role surfaces, and interactive demo behavior
- `artifacts/intellifleet/src/index.css` — IntelliFleet light-first visual tokens, typography, motion, and responsive rules
- `attached_assets/Pasted--IntelliFleet-Connected-Logistics-Platform-Frontend-Bui_1787727499014.txt` — product and design source of truth

## Architecture decisions

- The first phase is frontend-only and uses local mocked entities so every role can be previewed without authentication or provider setup.
- A single Wouter route shell serves public, dispatcher, driver, warehouse, client, and admin experiences for fast stakeholder walkthroughs.
- The visual system stays light-first across all surfaces; operational red/green are reserved for small status indicators.
- Fleet movement is simulated in the control tower to preserve the live-operations feel before a real GPS feed is connected.

## Product

IntelliFleet gives RGF teams a shared view of cold-chain deliveries: a public overview, live-feeling dispatcher tower, route/load/order/alert/comms workspaces, mobile driver flow, warehouse checklists, customer tracking, and admin governance screens.

## User preferences

- The approved direction is light, editorial, monochrome, and operationally restrained rather than dark tech-noir.

## Gotchas

- Provider connections and authentication are intentionally mocked in this phase; integration status copy must remain honest.
- The web artifact workflow supplies `PORT` and `BASE_PATH`; use the managed workflow for preview checks.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
