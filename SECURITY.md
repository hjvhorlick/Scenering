# Scenering security policy and production controls

Copyright © 2026 Henry John Vincent Horlick. All rights reserved.

## Security model

Scenering uses a server-authoritative account, membership, billing, entitlement, and usage layer. Passwords are salted with scrypt. Session, verification, and reset tokens are random and stored only as keyed hashes. Paid membership changes are accepted only from signature-verified Lemon Squeezy webhooks whose variant IDs map to the central plan configuration.

The browser is **not a trusted security boundary**. Interface locks improve usability but must never be the only paid-feature control. Provider credentials, subscription state, allowance decisions, and costly hosted services must remain server-authoritative.

## Controls implemented

- Production startup fails without a unique `SESSION_SECRET` of at least 32 characters and an explicit `PUBLIC_APP_URL`.
- Session cookies are HttpOnly, SameSite=Lax, Secure in production, path-scoped to the host, and marked high priority.
- Password reset invalidates all existing account tokens and reset/verification tokens expire.
- Authentication, contact, checkout, media proxy, provider verification, uploads, and TTS endpoints are rate limited.
- Browser state-changing requests are rejected when their Origin is not the configured application origin.
- Lemon Squeezy signatures are compared in constant time against the untouched request body; event IDs are idempotent and unknown variants grant no access.
- Checkout URLs receive the authenticated internal user id as provider custom data. Checkout return URLs never grant membership.
- Security response headers disable framing, MIME sniffing, unnecessary browser permissions, and cross-origin opener access. Production enables HSTS and a Content Security Policy.
- Image proxying is restricted to HTTPS and an explicit visual-provider host allowlist, validates every redirect, times out upstream calls, and caps image size.
- Provider API keys travel in request headers, never query strings.
- TTS, image research, key verification, imported-audio upload, and imported-audio retrieval require an authenticated account.
- Uploaded audio uses cryptographic identifiers, MIME and size validation, private caching, and account ownership checks.
- Sensitive production configuration is excluded from source control by `.gitignore`; only documented placeholders belong in `.env.example`.

## Important architecture limitation

Final video composition currently runs in the customer’s browser. Any JavaScript shipped to a browser can be inspected and modified by a determined user. Client-side locks, minification, watermarks, and copyright notices cannot make that renderer impossible to copy or bypass. The hosted APIs and membership records can be protected server-side, but absolute prevention of unauthorised local use requires moving final encoding—or at minimum a cryptographically verified finalisation stage—to trusted server infrastructure.

Before accepting material paid usage at scale, implement a server-side export-job system:

1. Atomically reserve allowance on the server with an idempotency key.
2. Bind the job to account, project, duration, plan, and an expiring nonce.
3. Perform or attest final encoding in trusted infrastructure.
4. Complete usage exactly once only after a successful final export.
5. Release failed or expired reservations safely.
6. Permit download only from an authorised, completed job.

The existing browser renderer can remain for unlimited previews. This split preserves the product’s responsive editing workflow while making final paid delivery enforceable.

## Required production operations

- Apply the Supabase commercial-platform migration and use row-level security/service-role separation. The local JSON platform store is a development fallback, not a horizontally scalable production database.
- Set a long random `SESSION_SECRET`, explicit HTTPS `PUBLIC_APP_URL`, `NODE_ENV=production`, and `TRUST_PROXY=1` only behind a trusted single reverse proxy.
- Configure genuine Lemon Squeezy checkout URLs, variant IDs, and webhook secret. Rotate any secret ever exposed to a client, log, or repository.
- Replace in-memory rate limiting with a shared Redis/database limiter when running more than one process.
- Use a transactional email provider with SPF, DKIM, and DMARC. Do not use the console adapter in production.
- Put the application behind a managed WAF/CDN with request-size limits, bot controls, TLS, DDoS protection, and alerting.
- Encrypt databases and backups, restrict administrator access with MFA, and retain auditable billing/security events without retaining unnecessary webhook payload data.
- Run dependency review, secret scanning, SAST, dynamic testing, backup-restore tests, and an independent penetration test before launch and after major architecture changes. The current production dependency audit reports zero vulnerabilities. npm still reports a high-severity glob-pattern denial-of-service advisory in the Tailwind 3 development-only build chain; do not expose build tooling in production, and migrate to Tailwind 4 after visual-regression testing rather than applying an unreviewed breaking upgrade.
- Maintain an incident-response contact, revocation process, recovery runbook, and security-update policy.

## Reporting a vulnerability

Do not disclose an exploitable issue publicly. Report it privately through Scenering’s published Contact channel with reproduction steps and impact. Never include passwords, payment credentials, API secrets, or personal customer data in a report.
