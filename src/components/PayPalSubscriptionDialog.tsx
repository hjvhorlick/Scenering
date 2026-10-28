import { useEffect, useRef, useState } from "react";
import type { BillingInterval, PlanSlug } from "../config/plans";
import { loadPayPalSdk } from "../lib/paypal-sdk";

interface Props {
  plan: Exclude<PlanSlug, "free"> | null;
  interval: BillingInterval;
  onClose: () => void;
}

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "PayPal could not complete this request.");
  return data;
}

export default function PayPalSubscriptionDialog({ plan, interval, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pendingSubscriptionId = useRef<string | null>(null);
  const approvedRef = useRef(false);
  const [message, setMessage] = useState("Loading secure PayPal checkout…");
  const [kind, setKind] = useState<"loading" | "error" | "cancelled" | "pending" | "success">("loading");

  useEffect(() => {
    if (!plan) return;
    let active = true;
    pendingSubscriptionId.current = null;
    approvedRef.current = false;
    let buttons: { render: (container: HTMLElement | string) => Promise<void>; close?: () => Promise<void> | void } | null = null;
    setKind("loading");
    setMessage("Loading secure PayPal checkout…");

    (async () => {
      const response = await fetch("/api/billing/public-config", { credentials: "same-origin" });
      const config = await response.json().catch(() => ({}));
      if (!response.ok || !config.configured || config.environment !== "sandbox" || !config.clientId) {
        throw new Error(config.error || "PayPal Sandbox is not fully configured yet.");
      }
      await loadPayPalSdk(String(config.clientId));
      if (!active || !mountRef.current || !window.paypal?.Buttons) return;
      setMessage("Choose PayPal to approve your subscription.");
      buttons = window.paypal.Buttons({
        style: { layout: "vertical", color: "gold", shape: "rect", label: "subscribe", height: 44 },
        createSubscription: async () => {
          const checkout = await postJson("/api/billing/paypal/create-subscription", { plan, interval });
          if (typeof checkout.subscriptionId !== "string" || !checkout.subscriptionId) throw new Error("PayPal did not return a subscription id.");
          pendingSubscriptionId.current = checkout.subscriptionId;
          return checkout.subscriptionId;
        },
        onApprove: async (data) => {
          if (!data.subscriptionID) throw new Error("PayPal returned no subscription id.");
          approvedRef.current = true;
          pendingSubscriptionId.current = null;
          const verified = await postJson("/api/billing/paypal/confirm-subscription", { subscriptionId: data.subscriptionID });
          if (verified.active) {
            setKind("success");
            setMessage("PayPal confirmed your subscription. Your Scenering plan is active.");
          } else {
            setKind("pending");
            setMessage("PayPal approved the subscription. We are waiting for its verified activation; your plan will unlock as soon as PayPal confirms it.");
          }
        },
        onCancel: async (data) => {
          approvedRef.current = true;
          pendingSubscriptionId.current = null;
          if (data.subscriptionID) {
            void postJson("/api/billing/paypal/cancel-subscription", { subscriptionId: data.subscriptionID }).catch(() => {});
          }
          setKind("cancelled");
          setMessage("Checkout was cancelled. No paid features were added.");
        },
        onError: (error) => {
          setKind("error");
          setMessage(error instanceof Error ? error.message : "PayPal checkout failed. Please try again.");
        },
      });
      await buttons.render(mountRef.current);
    })().catch((error) => {
      if (!active) return;
      setKind("error");
      setMessage((error as Error)?.message || "PayPal checkout could not be opened.");
    });

    return () => {
      active = false;
      if (pendingSubscriptionId.current && !approvedRef.current) {
        void postJson("/api/billing/paypal/cancel-subscription", { subscriptionId: pendingSubscriptionId.current }).catch(() => {});
        pendingSubscriptionId.current = null;
      }
      try { void buttons?.close?.(); } catch { /* PayPal may already have closed the dialog. */ }
    };
  }, [plan, interval]);

  if (!plan) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="w-full max-w-md rounded-2xl border border-white/15 bg-gray-950 p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="paypal-checkout-title">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="paypal-checkout-title" className="text-lg font-bold text-white">Pay with PayPal</h2>
            <p className="mt-1 text-sm text-gray-300">{plan === "sceneflow" ? "SceneFlow" : "SceneForge"} · {interval === "monthly" ? "monthly" : "yearly"}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-gray-300 hover:bg-white/10" aria-label="Close PayPal checkout">✕</button>
        </div>
        <div ref={mountRef} className="mt-5 min-h-12" />
        <p role="status" aria-live="polite" className={`mt-3 text-sm ${kind === "error" || kind === "cancelled" ? "text-amber-300" : kind === "success" ? "text-emerald-300" : "text-gray-300"}`}>{message}</p>
        {(kind === "success" || kind === "pending" || kind === "cancelled" || kind === "error") && (
          <div className="mt-4 flex justify-end gap-2">
            {kind === "success" && <a href="/welcome?payment=paypal" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">Continue</a>}
            {kind !== "success" && <button type="button" onClick={onClose} className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10">Close</button>}
          </div>
        )}
      </section>
    </div>
  );
}
