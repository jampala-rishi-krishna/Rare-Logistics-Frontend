# IntelliFleet Logistics Platform

## Database discipline (added 2026-09-24, after a full Neon wipe and re-architecture)

**Never create a new Neon table or column, or add a new DB read/write path, without
explicit approval from Rishi.** Check `docs/DATABASE.md` before touching persistence -
it lists every table Neon is supposed to have, exactly what triggers each read and
write, and what tabs depend on it. Update that file with every schema change.

The working model for this app:
- **LIVE data** (today's Sales Orders, Fleet status, GPS) is pulled from Zoho/Cartrack
  and displayed directly, with in-memory caching only - no DB reads for "today".
- **HISTORY** (assignment, status changes, delivery) is written to Neon once, at the
  moment it happens - never a bulk mirror of everything Zoho has.
- **Past-dated calendar views** are the only place the backend reads from Neon instead
  of the live APIs.
- Staff/contacts and conversations are NOT in Neon - they live in n8n DataTables, read
  through an in-memory cache (`backend/services/staff_directory_cache.py`), never
  fetched per-request.

If a task seems to call for a new table, a new column, or a new place that writes to
Postgres: stop and ask first, rather than adding it and updating the docs after.
