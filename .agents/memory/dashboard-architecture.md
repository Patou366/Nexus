---
name: Dashboard architecture
description: How the standalone bot config dashboard is structured and run
---

The dashboard lives entirely in `dashboard/` — it is a standalone project with its own `package.json` and `node_modules`, completely separate from the bot root.

- **Backend**: Express API on port 3001 (`dashboard/server/index.js`). DB via `POSTGRES_URL` env var.
- **Frontend**: React + Vite on port 5000 (`dashboard/client/`). Vite proxies `/api` → localhost:3001.
- **Workflow command**: `cd dashboard && npm run dev` (uses concurrently to start both).
- **Tailwind**: v3 with config at `dashboard/tailwind.config.js`, content path `./client/**/*.{js,jsx,html}`.
- **DB tables used**: `guilds.config` (JSONB), `welcome_configs.config`, `leveling_configs.config`.

**Why separate:** User explicitly stated this branch is 100% separate from bot code and will never be merged to main.

**How to apply:** Any future dashboard changes stay inside `dashboard/`. Never `npm install` dashboard deps at project root.
