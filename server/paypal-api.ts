import { env } from "../src/env.ts";
import { isProductionRuntime } from "../src/runtime-mode.ts";
import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval, type PlanSlug } from "../src/config/plans.ts";
import { buildPricingTiers } from "../src/config/pricing-tiers.ts";

const SANDBOX_API = "https://api-m.sandbox.paypal.com";
let cachedToken: { token: string; expiresAt: number } | null = null;

export class PayPalApiError extends Error {
  constructor(message: string, readonly status = 502, readonly code = "PAYPAL_PROVIDER_ERROR") {
    super(message);
    this.name = "PayPalApiError";
  }
}

export function paypalIsSandbox(): boolean {
  return String(env().PAYPAL_ENVIRONMENT || "sandbox").trim().toLowerCase() === "sandbox";
}

export function paypalPlanId(slug: Exclude<PlanSlug, "free">, interval: BillingInterval): string {
  const name = PLAN_CONFIG[slug].paypalPlanEnv[interval];
  return String(env()[name] || "").trim();
}

/**
 * The origin PayPal sends a member back to after approval or cancellation.
 *
 * Production must name it: `PUBLIC_APP_URL` is the address the customer
 * actually types, and a checkout that invents its own origin sends paying
 * members somewhere unverified. A development machine, a preview deployment
 * or a tunnel has no such fixed name — the host a request arrived on *is*
 * the only origin it can honestly claim — so outside production the caller
 * may pass the request's own origin and have it used whenever the variable
 * is unset. That is what keeps Sandbox checkout testable on a preview host
 * without a configuration file edit.
 */
export function paypalAppUrl(requestOrigin = ""): string {
  const configured = String(env().PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (isProductionRuntime(env())) return "";
  return String(requestOrigin || "").trim().replace(/\/+$/, "");
}

/** Every paid plan Scenering can sell: one plan id per plan and interval. */
export const PAYPAL_PLAN_SLOTS = (["sceneflow", "sceneforge"] as const).flatMap(
  (slug) => (["monthly", "yearly"] as const).map((interval) => ({ slug, interval })),
) as Array<{ slug: Exclude<PlanSlug, "free">; interval: BillingInterval }>;

/** The plan as a person reads it: "SceneFlow monthly". */
export function paypalPlanLabel(slug: Exclude<PlanSlug, "free">, interval: BillingInterval): string {
  return `${PLAN_CONFIG[slug].name} ${interval}`;
}

/**
 * What stops Sandbox checkout from running *at all*, named as the variable
 * that must be set. Values are never included — only names — so this is safe
 * to render in a browser or log.
 *
 * Plan ids are deliberately not in here. A Sandbox account usually has one
 * product set up while the others are still being built, and refusing the
 * one plan that exists until all four arrive is what made checkout look
 * broken. Missing plan ids are reported per plan instead (paypalPlanGaps).
 *
 * The webhook id is not in here either. Approval is verified by reading the
 * subscription straight back from PayPal, so a checkout can be tested end to
 * end before any webhook is registered; the webhook is what later carries
 * renewals, cancellations and payment failures, and it is reported as a
 * warning (paypalWebhookWarning) rather than as something that closes the
 * till.
 */
export function paypalSetupGaps(appUrl = paypalAppUrl()): string[] {
  const gaps: string[] = [];
  if (!paypalIsSandbox()) gaps.push("PAYPAL_ENVIRONMENT must be \"sandbox\"");
  if (!String(env().PAYPAL_CLIENT_ID || "").trim()) gaps.push("PAYPAL_CLIENT_ID is not set (Sandbox REST app client id)");
  if (!String(env().PAYPAL_CLIENT_SECRET || "").trim()) gaps.push("PAYPAL_CLIENT_SECRET is not set (Sandbox REST app secret)");
  if (!appUrl) gaps.push("PUBLIC_APP_URL is not set (the host PayPal returns the member to)");
  return gaps;
}

/**
 * The one thing that can wait: without the Sandbox webhook, Scenering still
 * verifies an approval by fetching the subscription from PayPal, but no
 * renewal, cancellation, suspension or failed payment will ever arrive.
 */
export function paypalWebhookWarning(): string | null {
  if (String(env().PAYPAL_WEBHOOK_ID || "").trim()) return null;
  return "PAYPAL_WEBHOOK_ID is not set — checkout can be tested without it, but renewal, cancellation and payment-failure events will not reach Scenering until the Sandbox webhook is registered.";
}

/**
 * The plans that have no Sandbox plan id yet, one line each.
 *
 * These do not block the plans that *are* set up: a Sandbox is normally
 * brought up one product at a time, so a missing plan id only takes that
 * plan off sale. `setupOnly` limits the list to the plans a caller actually
 * offers — the pricing page shows the interval the visitor is looking at
 * rather than every combination at once.
 */
export function paypalPlanGaps(setupOnly?: { slug: Exclude<PlanSlug, "free">; interval: BillingInterval }): string[] {
  return PAYPAL_PLAN_SLOTS
    .filter((slot) => !setupOnly || (setupOnly.slug === slot.slug && setupOnly.interval === slot.interval))
    .filter((slot) => !paypalPlanId(slot.slug, slot.interval))
    .map((slot) => `${paypalPlanLabel(slot.slug, slot.interval)} — ${PLAN_CONFIG[slot.slug].paypalPlanEnv[slot.interval]} is not set`);
}

export function paypalPublicConfig(requestOrigin = "") {
  const clientId = String(env().PAYPAL_CLIENT_ID || "").trim();
  const tiers = buildPricingTiers((name) => String(env()[name] || ""));
  const appUrl = paypalAppUrl(requestOrigin);
  const blocking = paypalSetupGaps(appUrl);
  const planGaps = paypalPlanGaps();
  // One set-up plan is enough to test with; the rest simply stay off sale.
  const configured = blocking.length === 0 && planGaps.length < PAYPAL_PLAN_SLOTS.length;
  return {
    provider: "paypal" as const,
    environment: "sandbox" as const,
    clientId,
    currency: "USD" as const,
    configured,
    tiers,
    /**
     * Why checkout is unavailable, in plain variable names. The browser shows
     * this instead of a dead button, which is the difference between "the
     * PayPal buttons do not work" and a two-minute configuration fix.
     */
    missing: configured ? [] : [...blocking, ...planGaps],
    /** Plans with no Sandbox plan id yet, so the UI can keep them off sale. */
    unconfiguredPlans: planGaps,
    /** What still has to be done, without blocking the checkout itself. */
    warnings: [paypalWebhookWarning()].filter((item): item is string => Boolean(item)),
  };
}

/**
 * PayPal's own explanation of a refusal, shortened for a member-facing line.
 *
 * Every PayPal error body carries the reason — `error_description` on the token
 * endpoint, `message` plus `details[0].description` on the billing APIs — and
 * none of it is a credential. It is written for developers, so it is appended
 * to Scenering's sentence and capped rather than replacing it: the person
 * reading the dialog needs to know which of two very different problems they
 * have (a secret that does not match the client id, or an app that was never
 * granted the scope), and only PayPal's text says which.
 */
export function paypalErrorDetail(data: any): string {
  const first = data?.details?.[0];
  const description = typeof first?.description === "string" ? first.description.trim() : "";
  const issue = typeof first?.issue === "string" ? first.issue.trim() : "";
  const text = String(
    data?.error_description || data?.message || [issue, description].filter(Boolean).join(": ") || data?.error || "",
  ).trim();
  if (!text) return "";
  return ` — PayPal said: ${text.length > 160 ? `${text.slice(0, 157)}…` : text}`;
}

function credentials(): { clientId: string; clientSecret: string } {
  if (!paypalIsSandbox()) throw new PayPalApiError("PayPal Live mode is disabled until a separate approved cutover.", 503, "PAYPAL_LIVE_DISABLED");
  const clientId = String(env().PAYPAL_CLIENT_ID || "").trim();
  const clientSecret = String(env().PAYPAL_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) throw new PayPalApiError("PayPal Sandbox credentials are not configured.", 503, "PAYPAL_NOT_CONFIGURED");
  return { clientId, clientSecret };
}

async function accessToken(): Promise<string> {
  if (!paypalIsSandbox()) throw new PayPalApiError("PayPal Live mode is disabled until a separate approved cutover.", 503, "PAYPAL_LIVE_DISABLED");
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;
  const { clientId, clientSecret } = credentials();
  let response: Response;
  try {
    response = await fetch(`${SANDBOX_API}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PayPalApiError("Could not reach PayPal Sandbox.");
  }
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || typeof data.access_token !== "string") {
    /* PayPal already says why — `invalid_client`, "Client Authentication
       failed" — and this used to throw that away, so "PayPal Sandbox
       authentication failed." was the whole story. That left no way to
       distinguish a secret that does not pair with the committed client id
       from an app that was never granted the scope, which are fixed in
       completely different places. PayPal's reason is appended, not swapped
       in, and it carries no credential. */
    throw new PayPalApiError(`PayPal Sandbox authentication failed${paypalErrorDetail(data)}.`, 502, "PAYPAL_AUTH_FAILED");
  }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, Number(data.expires_in) || 300) * 1000,
  };
  return cachedToken.token;
}

export async function paypalApi<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessToken();
  let response: Response;
  try {
    response = await fetch(`${SANDBOX_API}${path}`, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new PayPalApiError("Could not reach PayPal Sandbox.");
  }
  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    const status = response.status === 401 || response.status === 403 ? 502 : response.status;
    /* A 403 from PayPal is usually PERMISSION_DENIED — the app can create a
       subscription but not read one, which is a dashboard/scope problem and
       not something anybody can diagnose from "could not complete the billing
       request". PayPal's own issue and description go in the message. */
    throw new PayPalApiError(`PayPal Sandbox could not complete the billing request${paypalErrorDetail(data)}.`, status, "PAYPAL_PROVIDER_ERROR");
  }
  return data as T;
}

export async function createPayPalSubscription(input: {
  planId: string;
  userId: string;
  email: string;
  intentToken: string;
  returnUrl: string;
  cancelUrl: string;
}) {
  return paypalApi<any>("/v1/billing/subscriptions", {
    method: "POST",
    body: {
      plan_id: input.planId,
      custom_id: input.intentToken,
      subscriber: { email_address: input.email },
      application_context: {
        brand_name: "Scenering",
        user_action: "SUBSCRIBE_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: input.returnUrl,
        cancel_url: input.cancelUrl,
      },
    },
  });
}

export async function getPayPalSubscription(subscriptionId: string) {
  return paypalApi<any>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function cancelPayPalSubscription(subscriptionId: string, reason: string) {
  return paypalApi<any>(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: { reason },
  });
}

export async function verifyPayPalWebhook(headers: Record<string, string | string[] | undefined>, event: unknown): Promise<boolean> {
  const webhookId = String(env().PAYPAL_WEBHOOK_ID || "").trim();
  if (!webhookId) return false;
  const value = (name: string) => String(headers[name] || "").trim();
  const required = {
    auth_algo: value("paypal-auth-algo"),
    cert_url: value("paypal-cert-url"),
    transmission_id: value("paypal-transmission-id"),
    transmission_sig: value("paypal-transmission-sig"),
    transmission_time: value("paypal-transmission-time"),
  };
  if (Object.values(required).some((part) => !part)) return false;
  try {
    const result = await paypalApi<any>("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        ...required,
        webhook_id: webhookId,
        webhook_event: event,
      },
    });
    return result?.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

export function resetPayPalTokenCacheForTests() {
  cachedToken = null;
}
