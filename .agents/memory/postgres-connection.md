---
name: PostgreSQL connection on Replit
description: How the bot connects to Railway PostgreSQL from Replit — which env var to use and why
---

## Rule
Always prefer `DATABASE_PUBLIC_URL` for the PostgreSQL connection string. Never use `POSTGRES_URL` as the primary source — it is a Railway internal hostname (`postgres.railway.internal`) that only resolves inside Railway's private network.

**Priority order in `src/config/postgres.js`:**
1. `DATABASE_PUBLIC_URL` — public Railway proxy, works from Replit and Railway
2. `DATABASE_URL` — may be internal or public depending on Railway project settings
3. `POSTGRES_URL` — Railway-internal only, last resort

**Why:** `pg.Pool` was previously built from individual `host/port/user/pass` env vars that all defaulted to `localhost`. Even when `POSTGRES_URL` was set, it was ignored. Fix: parse the connection URL in `postgres.js` into `_parsedUrl` and expose `pgConfig.connectionString`; in `postgresDatabase.js` use `connectionString` when available, individual options otherwise.

**How to apply:** Any time you touch `src/config/postgres.js` or `src/utils/postgresDatabase.js`, verify this priority order is intact and that `connectionString` is passed to `pg.Pool` when set.

**SSL:** Railway requires `ssl: { rejectUnauthorized: false }` — set automatically when a URL is parsed.
