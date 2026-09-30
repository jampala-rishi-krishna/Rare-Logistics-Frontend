# IntelliFleet Logistics Platform

## Database discipline

Never create a new Neon table or column, or add a new DB read/write path, without explicit approval. Check `docs/DATABASE.md` before touching persistence and update it with every schema change.

- Live today's Sales Orders, Fleet status, and GPS come from Zoho/Cartrack with in-memory caching only; no DB reads for today.
- History (assignment, status changes, delivery) is written to Neon once at the moment it happens; never bulk mirror Zoho.
- Past-dated calendar views are the only backend reads from Neon instead of live APIs.
- Staff/contacts and conversations are not in Neon; they live in n8n DataTables through the in-memory staff directory cache.
