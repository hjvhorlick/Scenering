import type { Tier } from "../config/pricing-tiers";

export interface PublicBillingConfig {
  provider: "paypal";
  environment: "sandbox";
  clientId: string;
  currency: "USD";
  configured: boolean;
  previewTestPlan?: { plan: "sceneflow" | "sceneforge"; interval: "monthly" | "yearly" } | null;
  tiers: Tier[];
}

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

let sdkPromise: Promise<void> | null = null;
let sdkClientId = "";

/** Load PayPal's official browser SDK at runtime; never bake a client id into the app bundle. */
export function loadPayPalSdk(clientId: string): Promise<void> {
  if (!clientId) return Promise.reject(new Error("PayPal Sandbox is not configured."));
  if (window.paypal?.Buttons && sdkClientId === clientId) return Promise.resolve();
  if (sdkPromise && sdkClientId === clientId) return sdkPromise;
  sdkClientId = clientId;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("scenering-paypal-sdk") as HTMLScriptElement | null;
    if (existing) existing.remove();
    const script = document.createElement("script");
    script.id = "scenering-paypal-sdk";
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&vault=true&intent=subscription&currency=USD`;
    script.async = true;
    script.onload = () => window.paypal?.Buttons ? resolve() : reject(new Error("PayPal checkout did not initialize."));
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("PayPal Sandbox could not load. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export type { PayPalButtonOptions, PayPalButtonResult };
