# 🤖 Nexus Custom Bot

A highly customized, bilingual (English/Spanish), premium Discord bot built for server management, advanced utilities, and automated data recovery. This version is optimized for hosting on **Railway** with a **PostgreSQL** database backend.

---

## 🚀 Key Features

*   **🌐 100% Bilingual Interface:** Every single system message, log, embed, and error message is written in an English / Spanish format (`English / Español`).
*   **🛡️ Automated Server Backup System (`/save-server`, `/save-server-list`, `/restore`):** 
    *   Saves complete snapshots of categories, channel layouts, and explicit role permissions directly to a Postgres database.
    *   Enforces a strict 5-save limit per server (automatically overwriting the oldest snapshot).
    *   Allows Administrators to instantly restore missing or accidentally deleted channels to their exact original state.
*   **🎯 Milestone Management (`/set-milestones`):** Track and celebrate server achievements and engagement targets dynamically.
*   **⚖️ Built-in Admin Safety:** High-end utility commands are automatically locked strictly to members with **Administrator** permissions at the Discord API level.

---

## 🛠️ Infrastructure & Technologies

*   **Language:** JavaScript (Node.js)
*   **Library:** Discord.js (v14+)
*   **Database:** PostgreSQL (for permanent data persistence across bot restarts)
*   **Hosting Platform:** Railway

---

## ⚙️ Deployment & Environment Variables

To run this bot successfully on your own Railway instance, you must configure the following **Environment Variables** (Variables tab in Railway):

| Variable | Description |
| :--- | :--- |
| `DISCORD_TOKEN` | Your Discord Bot token from the Developer Portal. |
| `CLIENT_ID` | Your Discord application's Client ID. |
| `DATABASE_URL` | Your connection string for the PostgreSQL database instance. |

---

## 📌 Maintenance Notes (For Forks)
This repository is configured as a standalone custom fork. **Do not pull upstream changes or sync the fork** directly through GitHub, as doing so may conflict with the customized PostgreSQL schema and custom command handlers.
