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

/**
 * What is still missing before Sandbox checkout can run, named as the
 * variable that must be set. Values are never included — only names — so
 * this is safe to render in a browser or log.
 */
export function paypalSetupGaps(appUrl = paypalAppUrl()): string[] {
  const gaps: string[] = [];
  if (!paypalIsSandbox()) gaps.push("PAYPAL_ENVIRONMENT must be \"sandbox\"");
  if (!String(env().PAYPAL_CLIENT_ID || "").trim()) gaps.push("PAYPAL_CLIENT_ID is not set (Sandbox REST app client id)");
  if (!String(env().PAYPAL_CLIENT_SECRET || "").trim()) gaps.push("PAYPAL_CLIENT_SECRET is not set (Sandbox REST app secret)");
  if (!String(env().PAYPAL_WEBHOOK_ID || "").trim()) gaps.push("PAYPAL_WEBHOOK_ID is not set (Sandbox webhook id)");
  if (!appUrl) gaps.push("PUBLIC_APP_URL is not set (the host PayPal returns the member to)");
  for (const slug of PLAN_ORDER) {
    if (slug === "free") continue;
    for (const interval of ["monthly", "yearly"] as const) {
      if (!paypalPlanId(slug, interval)) gaps.push(`${PLAN_CONFIG[slug].paypalPlanEnv[interval]} is not set (${PLAN_CONFIG[slug].name} ${interval} Sandbox plan id)`);
    }
  }
  return gaps;
}

export function paypalPublicConfig(requestOrigin = "") {
  const clientId = String(env().PAYPAL_CLIENT_ID || "").trim();
  const tiers = buildPricingTiers((name) => String(env()[name] || ""));
  const idsReady = tiers.filter((tier) => tier.id !== "free").every((tier) => tier.planId.monthly && tier.planId.yearly);
  const appUrl = paypalAppUrl(requestOrigin);
  const configured = paypalIsSandbox() && Boolean(clientId) && Boolean(String(env().PAYPAL_CLIENT_SECRET || "").trim()) && Boolean(String(env().PAYPAL_WEBHOOK_ID || "").trim()) && Boolean(appUrl) && idsReady;
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
    missing: paypalSetupGaps(appUrl),
  };
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
    throw new PayPalApiError("PayPal Sandbox authentication failed.", 502, "PAYPAL_AUTH_FAILED");
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
    throw new PayPalApiError("PayPal Sandbox could not complete the billing request.", status, "PAYPAL_PROVIDER_ERROR");
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
