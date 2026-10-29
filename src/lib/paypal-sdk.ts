import { PLAN_CONFIG, type BillingInterval, type PlanSlug } from "../config/plans";
import type { Tier } from "../config/pricing-tiers";

type PayPalButtonResult = {
  render: (container: HTMLElement | string) => Promise<void>;
  close?: () => Promise<void> | void;
};
interface PayPalButtonOptions {
  createSubscription: (data: unknown, actions: any) => Promise<string> | string;
  onApprove: (data: { subscriptionID?: string }, actions: any) => Promise<void> | void;
  onCancel?: (data: { subscriptionID?: string }) => Promise<void> | void;
  onError?: (error: unknown) => Promise<void> | void;
  style?: Record<string, unknown>;
}

declare global {
  interface Window {
    paypal?: { Buttons: (options: PayPalButtonOptions) => PayPalButtonResult };
  }
}

export interface PublicBillingConfig {
  provider: "paypal";
  environment: "sandbox";
  clientId: string;
  currency: "USD";
  /** True only when this runtime can actually run a Sandbox checkout. */
  configured: boolean;
  /** The same answer, named for what the browser does with it. */
  checkoutEnabled?: boolean;
  sandbox?: boolean;
  production?: boolean;
  /** Variable names only — never values — describing what is still missing. */
  missing?: string[];
  /** Plans with no Sandbox plan id yet: "SceneFlow monthly — PAYPAL_… is not set". */
  unconfiguredPlans?: string[];
  /** What is still outstanding without blocking checkout — the webhook, mainly. */
  warnings?: string[];
  tiers: Tier[];
}

/** The plan as a person reads it: "SceneFlow monthly". */
export function paypalPlanLabel(slug: Exclude<PlanSlug, "free">, interval: BillingInterval): string {
  return `${PLAN_CONFIG[slug].name} ${interval}`;
}

/** The server variable that holds this plan's Sandbox id — safe to show, it names no value. */
export function paypalPlanVariable(slug: Exclude<PlanSlug, "free">, interval: BillingInterval): string {
  return PLAN_CONFIG[slug].paypalPlanEnv[interval];
}

/**
 * Whether this one plan and interval can actually be bought.
 *
 * A Sandbox is normally brought up one product at a time, so a missing plan
 * id only takes that plan off sale — the plans that are set up stay
 * purchasable instead of all four waiting for the last one.
 */
export function paypalPlanReady(config: PublicBillingConfig | null, slug: PlanSlug, interval: BillingInterval): boolean {
  if (slug === "free") return true;
  return Boolean(config?.tiers.find((tier) => tier.id === slug)?.planId?.[interval]);
}

let sdkPromise: Promise<void> | null = null;
let sdkClientId = "";

/**
 * Drop the cached SDK load so the next call injects the script again.
 *
 * The loader used to keep a rejected promise forever: one blocked or dropped
 * request to paypal.com (an offline tab, a corporate filter, an ad blocker)
 * left every later "Try again" showing the *first* failure without ever
 * retrying, which reads as "the PayPal buttons are broken".
 */
export function resetPayPalSdk() {
  sdkPromise = null;
  if (typeof document !== "undefined") document.getElementById("scenering-paypal-sdk")?.remove();
}

/** Load PayPal's official browser SDK at runtime; never bake a client id into the app bundle. */
export function loadPayPalSdk(clientId: string): Promise<void> {
  if (!clientId) return Promise.reject(new Error("PayPal Sandbox is not configured."));
  if (window.paypal?.Buttons && sdkClientId === clientId) return Promise.resolve();
  if (sdkPromise && sdkClientId === clientId) return sdkPromise;
  sdkClientId = clientId;
  const loading = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("scenering-paypal-sdk") as HTMLScriptElement | null;
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.id = "scenering-paypal-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription&currency=USD`;
    script.async = true;
    script.onload = () => window.paypal?.Buttons
      ? resolve()
      : reject(new Error("PayPal loaded, but its checkout buttons did not initialize. Reload the page and try again."));
    script.onerror = () => reject(new Error("PayPal Sandbox could not load. Check your connection, ad-blocker or VPN and try again."));
    document.head.appendChild(script);
  });
  sdkPromise = loading;
  // Failure must not be sticky: clear the cache and the half-loaded script so
  // the next attempt really is a fresh one.
  loading.catch(() => {
    if (sdkPromise === loading) sdkPromise = null;
    document.getElementById("scenering-paypal-sdk")?.remove();
  });
  return loading;
}

export type { PayPalButtonOptions, PayPalButtonResult };
