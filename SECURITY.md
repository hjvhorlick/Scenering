# Scenering security policy and production controls

Copyright © 2026 Henry John Vincent Horlick. All rights reserved.

## Security model

Scenering uses a server-authoritative account, membership, billing, entitlement, and usage layer. Passwords are salted with scrypt. Session, verification, and reset tokens are random and stored only as keyed hashes. Paid membership changes are accepted only from signature-verified FastSpring webhooks whose product paths map to the central plan configuration.

The browser is **not a trusted security boundary**. Interface locks improve usability but must never be the only paid-feature control. Provider credentials, subscription state, allowance decisions, and costly hosted services must remain server-authoritative.

## Controls implemented

- Production is the default. `NODE_ENV` unset, empty or unexpected means a production server (`src/runtime-mode.ts`); only an explicit `development`/`test` unlocks a development shortcut. Deployments set `NODE_ENV=production` in `wrangler.jsonc`, and previews set `development`.
- Production authentication fails closed (`503 AUTH_CONFIG_UNAVAILABLE`) without a unique `SESSION_SECRET` of at least 32 characters, and outbound verification/password-reset mail fails closed (`503 EMAIL_DELIVERY_UNAVAILABLE`) without an explicit HTTPS `PUBLIC_APP_URL`, `EMAIL_PROVIDER=resend`, and `RESEND_API_KEY`, while keeping `/api/health` and public pages reachable.
- Session cookies are HttpOnly, SameSite=Lax, Secure in production, path-scoped to the host, and marked high priority.
- Password reset invalidates all existing account tokens and reset/verification tokens expire.
- Owner administration is granted only after the mailbox configured in `SCENERING_OWNER_EMAIL` completes email verification; a matching address alone cannot claim the role. A later owner-email change revokes the former owner's administrator role on their next authenticated request.
- Production sessions are HttpOnly cookies. The optional bearer-token bridge exists only for an explicitly enabled, non-production embedded preview and is held in session storage rather than persistent local storage.
- Authentication, contact, checkout, media proxy, provider verification, uploads, and TTS endpoints are rate limited.
- Browser state-changing requests are rejected when their Origin is not the configured application origin.
- FastSpring `X-FS-Signature` headers are compared in constant time against the untouched request body (base64 HMAC-SHA256 of `rawBody`); event IDs are idempotent and unknown product paths grant no access.
- Checkout sessions are tagged server-side with the authenticated internal user id and email (`tags.user_id` and `tags.email`), and signed webhooks are the only authority for paid access. Checkout return URLs never grant membership.
- Security response headers disable framing, MIME sniffing, unnecessary browser permissions, and cross-origin opener access. Production enables HSTS and a Content Security Policy.
- Image proxying is restricted to HTTPS and an explicit visual-provider host allowlist, validates every redirect, times out upstream calls, and caps image size.
- Provider API keys travel in request headers, never query strings.
- TTS, image research, key verification, imported-audio upload, and imported-audio retrieval require an authenticated account.
- Uploaded audio uses cryptographic identifiers, MIME and size validation, private caching, and account ownership checks.
- Sensitive production configuration is excluded from source control by `.gitignore`; only documented placeholders belong in `.env.example`.
- Email-verification and password-reset links are returned in an API response **only** by a development or test server. In production the emailed link is the only route, even when mail delivery fails and even on a test storefront. Previously the token was handed back to the caller, so an account could be created with an address the caller does not control and verified without reading the mailbox.
- Every session is bound to the device that opened it (`device_id`, `device_label`, `platform`, `last_seen_at`), and the plan's device allowance is enforced server-side: Free 1, SceneFlow 2, SceneForge 5, phones included. Opening one more signs out the device that has been idle longest; the account panel lists them.
- Projects, scenes and their per-project documents are held in a server-side workspace repository (`workspace_documents`) per account, so one membership sees the same work on every device. Writes are revision-checked, deletions are tombstones, and credentials (`scenering_customer_api_keys`), the session token and this browser's identity are deliberately never synced (`src/lib/workspace-keys.ts`, checked against every key the source uses).
- `POST /api/usage/final-export` is retired (410). It recorded an export from a client-supplied duration and format without the creative-manifest policy, the length ceilings or a reservation.
- Export completion is atomic and time-bound: a reservation can only be completed once, while it is still within its two-hour window, and the plan's remaining allowance is re-checked against the week the usage row lands in.

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

### What the browser still asserts (reviewed 2026-10)

A plan-bypass review found and closed the account-side holes listed under *Controls implemented*. Two limits remain, both consequences of rendering in the browser:

- **Duration.** A Vault download reports its export reservation, and the server then counts the duration and format *it* authorised at reserve time rather than a number retyped by the browser. A download with no reservation (a render made before this existed) still falls back to the reported duration, and nothing server-side can measure a file it never encoded, so the Free length ceilings remain enforced against a number the browser supplies. The reservation path makes that number consistent across the creative policy, the allowance and the download; it does not make it verifiable.
- **A download is a browser save.** The server counts downloads and refuses when the allowance is spent, but it cannot prevent a determined user from keeping pixels it already delivered to their machine. Documented watermarks and client locks are not a control.

Both are resolved only by the server-side export-job design above.

## Required production operations

- Apply the Supabase commercial-platform migration and use row-level security/service-role separation. The local JSON platform store is a development fallback, not a horizontally scalable production database.
- Set a long random `SESSION_SECRET`, explicit HTTPS `PUBLIC_APP_URL`, `NODE_ENV=production` (already the default in `wrangler.jsonc`), and `TRUST_PROXY=1` only behind a trusted single reverse proxy. `SCENERING_AUTH_SECRET` is only a legacy alias for `SESSION_SECRET` — never the name to configure a deployment with.
- Apply migration `0007_devices_workspace.sql` with the rest of `migrations/`; the device limits and workspace sync depend on it.
- Configure genuine FastSpring storefront path, product paths, optional API credentials and webhook secret key, and make sure `FASTSPRING_STOREFRONT` points at your live storefront in production. Rotate any secret ever exposed to a client, log, or repository.
- Replace in-memory rate limiting with a shared Redis/database limiter when running more than one process.
- Use a transactional email provider with SPF, DKIM, and DMARC. Do not use the console adapter in production.
- Put the application behind a managed WAF/CDN with request-size limits, bot controls, TLS, DDoS protection, and alerting.
- Encrypt databases and backups, restrict administrator access with MFA, and retain auditable billing/security events without retaining unnecessary webhook payload data.
- Run dependency review, secret scanning, SAST, dynamic testing, backup-restore tests, and an independent penetration test before launch and after major architecture changes. The current production dependency audit reports zero vulnerabilities. npm still reports seven advisories (five high, two moderate) in Tailwind 3's development-only build chain, including pattern/selector parsing denial-of-service paths; do not expose build tooling in production, and migrate to Tailwind 4 after visual-regression testing rather than applying an unreviewed breaking upgrade.
- Maintain an incident-response contact, revocation process, recovery runbook, and security-update policy.

## Reporting a vulnerability

Do not disclose an exploitable issue publicly. Report it privately through Scenering’s published Contact channel with reproduction steps and impact. Never include passwords, payment credentials, API secrets, or personal customer data in a report.
