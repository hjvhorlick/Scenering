# PayPal recurring subscriptions — Sandbox only

Scenering subscriptions use PayPal Sandbox for development and testing only. The previous checkout provider has been removed from active runtime, configuration and user-facing flows. PayPal checkout is available only in development, the server refuses it in production, and the API client is hard-pinned to PayPal Sandbox. No Live-mode cutover, deployment, or webhook registration is authorized.

## Scenering plans

Create four recurring subscription plans in the PayPal Sandbox business account. Preserve the existing Scenering USD prices and intervals:

| Scenering plan | PayPal billing frequency | Price |
| --- | --- | ---: |
| SceneFlow monthly | Monthly | USD 19 |
| SceneFlow yearly | Yearly | USD 180 |
| SceneForge monthly | Monthly | USD 39 |
| SceneForge yearly | Yearly | USD 372 |

Set each Sandbox plan ID in the matching server-side variable:

- `PAYPAL_SCENEFLOW_MONTHLY_PLAN_ID`
- `PAYPAL_SCENEFLOW_YEARLY_PLAN_ID`
- `PAYPAL_SCENEFORGE_MONTHLY_PLAN_ID`
- `PAYPAL_SCENEFORGE_YEARLY_PLAN_ID`

The server chooses the plan ID from the authenticated checkout request. Never accept a PayPal plan ID or user ID supplied by the browser as authoritative. Free remains a Scenering account option, not a PayPal subscription.

## Runtime configuration

Set `PAYPAL_ENVIRONMENT=sandbox`, the Sandbox REST app `PAYPAL_CLIENT_ID`, the corresponding `PAYPAL_CLIENT_SECRET`, all four plan IDs, and `PUBLIC_APP_URL`. The Client ID is published at runtime only to load PayPal's official JavaScript SDK. Keep the Client Secret and `PAYPAL_WEBHOOK_ID` in server-side secrets; do not add credentials to Vite variables, source control, browser code, screenshots, or chat. `.dev.vars.example` contains empty placeholders only.

Checkout stays disabled until the Sandbox Client ID, Client Secret, all plan IDs, Webhook ID, and public app URL are configured. Apply `migrations/0008_paypal_billing.sql` only to the non-production D1 database used for Sandbox testing; do not apply it to production as part of this implementation. Production runtime is always rejected for PayPal Sandbox checkout.

## Webhook — verify the deployment before registering

The implemented backend callback path is `/api/webhooks/paypal`. **Do not paste a guessed or locally inferred URL into PayPal.** First deploy the reviewed Sandbox-capable backend to the intended non-production host, confirm that `PUBLIC_APP_URL` names that exact host, and independently verify that an unauthenticated `POST` reaches the Scenering Worker at that path. With `PAYPAL_WEBHOOK_ID` unset, the verified route should return its explicit “verification is not configured” response (503); a 404, proxy error, or host-routing error means the endpoint is not verified. Do not register the callback until the full public URL and reachable backend have been confirmed.

After verification, register the exact reachable URL in the PayPal **Sandbox** app and subscribe to:

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `BILLING.SUBSCRIPTION.PAYMENT.FAILED`
- `PAYMENT.SALE.COMPLETED`
- `PAYMENT.SALE.DENIED`

Store the Sandbox webhook ID in `PAYPAL_WEBHOOK_ID`. Scenering asks PayPal's verification API to validate each delivery before processing it. Event IDs are atomically claimed in D1; duplicate deliveries do not apply lifecycle changes twice, and transient provider errors remain retryable.

## Account association and entitlements

Checkout requires the existing authenticated Scenering session. The Worker creates a random, short-lived checkout intent bound to the session user, selected plan, interval, and server-configured Sandbox plan ID. Only a hash of the random intent token is stored. On approval, the Worker fetches the subscription from PayPal and verifies its ID, plan, intent token, and Scenering user association. Paid access is granted only after verified server state/webhooks; a browser callback never grants entitlements. The account area provides PayPal Sandbox self-service and cancellation controls. Existing historical subscription rows and migration history are retained; no database cleanup or destructive migration is part of this change.

## Validation before any rollout

Run `npm run typecheck`, `npm run worker:typecheck`, `npm test`, and `npm run build`. Exercise Sandbox cases for successful approval, wrong plan, another user's subscription ID, invalid webhook signature, duplicate and concurrent event delivery, payment failure, suspension, cancellation, expiry, and retry after transient PayPal errors. Do not use Live credentials or deploy a production cutover as part of this work.
