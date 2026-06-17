# Security Policy — Nexus Bot

We take security seriously. If you discover a vulnerability, please follow the policy below so we can triage and address it safely.

## Summary / Self-hosting clarity
Nexus Bot is distributed as open-source software for self-hosting. We (the maintainers) do not operate self-hosted instances and do not have access to user data or configurations on third-party deployments. Self-hosters are responsible for securing and operating their instances. This policy describes how to report vulnerabilities affecting the project code and guidance for self-hosters who discover security issues in their deployment.

## Reporting a Vulnerability (preferred)
- Preferred channel: Open a private GitHub Security Advisory for this repository (recommended).
- Do NOT open a public issue with exploit details.

If you found a problem in your self-hosted instance that appears to be due to misconfiguration, please contact the instance operator/host first. If you believe the issue is caused by a vulnerability in Nexus Bot code, follow the reporting steps above and indicate whether the report comes from a self-hosted deployment.

## Response timelines (what to expect)
- Acknowledgement: within 72 hours.
- Triage & severity estimate: within 7 days.
- Fix/migration plan:
  - Critical: aim to ship fix or mitigation within 7–14 days.
  - High: aim to ship within 30 days.
  - Medium/Low: addressed in a future release; communicated within 90 days.
- Public disclosure: we will coordinate with the reporter and normally publish an advisory after a patch is released, or within 90 days if unresolved (unless the reporter requests otherwise).

## Safe testing rules (researcher rules of engagement)
- Only test services you own or have explicit permission to test.
- Do not exfiltrate, destroy, or modify user data.
- Do not attempt to escalate to or access Discord user tokens, DMs, or other private user content.
- Provide minimal, safe PoC that reproduces the issue. Redact sensitive data (tokens, PII, database strings).
- If the vulnerability requires intrusive testing, contact us first to agree on a plan.

## What to include in your report
- Component affected (e.g., server layout backups, database migration, command parser).
- Clear, minimal steps to reproduce.
- Environment: commit SHA, release tag, or package version.
- Whether the issue was observed on a self-hosted deployment (and the deployment configuration).
- PoC (script, Discord payload, logs, screenshots) — sanitize secrets before sharing.
- Impact (data exposure, unauthorized server layout restoration, privilege escalation, etc.).
- Suggested mitigation (if any).
- Contact info for follow-up.

## Incident reporting from self-hosted deployments
If you operate a self-hosted Nexus Bot instance and suffer a security incident:
- Immediately rotate any exposed secrets (Discord bot token, `DATABASE_URL` credentials, API keys).
- Take a snapshot of logs/configuration for investigation (avoid sharing secrets).
- If you need upstream help, file a private security advisory and include sanitized reproduction steps and the Nexus version/commit.
- The maintainers can only fix vulnerabilities in upstream code; we cannot rotate tokens, restore data, or remediate other hosts' deployments.

## Scope
- In-scope: this repository's code, authentication flows, webhooks provided by this project, and the database queries handling server layout snapshots.
- Out-of-scope: third-party services (Discord itself, Railway hosting infrastructure, or external PostgreSQL providers), and instances you do not own without owner consent.

## Maintenance & Hardening advice for self-hosters (recommended defaults)
- **Protect Environment Variables:** Keep all secrets out of the repository codebase. Use Railway's **Variables** panel to manage your `DISCORD_TOKEN` and `DATABASE_URL`.
- **Database Access Security:** Do not expose your PostgreSQL database to the public internet. If using Railway, utilize internal networking/private variables to connect your bot service directly to your database plugin.
- **Access Control:** Restrict the bot's custom commands (such as server layout snapshots and restorations) strictly to accounts with the native **Administrator** permission flag enabled.
- **Keep Upstream Forks Intact:** Avoid syncing forks blindly if you have highly customized internal structural features (like explicit database tables) to prevent unexpected codebase overwrites.
- **Regular Backups:** While the database tracks layout backups locally, ensure your core PostgreSQL instance has automated backups enabled through your infrastructure provider.
- **Rotate Compromised Tokens:** Instantly generate a new bot token via the Discord Developer Portal if you suspect your deployment environment has been compromised.

## Disclosure & Credits
- We will credit researchers in release notes/advisories unless you request anonymity.
- We may assign a CVE or coordinate with CERT/other bodies for high-severity issues.

## Privacy & Telemetry
- Nexus Bot does not phone home or collect usage data by default. 
- Maintainers do not receive data from self-hosted instances. 

## Contact
- Preferred: GitHub Private Security Advisory for this repository.

Thank you for helping keep Nexus Bot safe.
