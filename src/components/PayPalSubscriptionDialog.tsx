import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BillingInterval, PlanSlug } from "../config/plans";
import { loadPayPalSdk, resetPayPalSdk, type PublicBillingConfig } from "../lib/paypal-sdk";
import { refreshSession } from "../lib/session";
/* This dialog is portalled into `document.body`, so it can be opened from the
   studio (which carries the Tailwind build) or from the public website (which
   carries only marketing.css and never loads it). It therefore ships its own
   stylesheet — see the note at the top of paypal-checkout.css. */
import "./paypal-checkout.css";

interface Props {
  plan: Exclude<PlanSlug, "free"> | null;
  interval: BillingInterval;
  onClose: () => void;
}

type Kind = "loading" | "error" | "cancelled" | "pending" | "success";

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const missing = Array.isArray(data.missing) ? data.missing : [];
    // A 503 used to arrive as one flat sentence, so an operator could not tell
    // a missing webhook id from a missing plan id. Say which variable.
    const detail = missing.length ? ` Still to set: ${missing.join("; ")}.` : "";
    throw new Error(`${data.error || "PayPal could not complete this request."}${detail}`);
  }
  return data;
}

export default function PayPalSubscriptionDialog({ plan, interval, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pendingSubscriptionId = useRef<string | null>(null);
  const approvedRef = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("Loading secure PayPal checkout…");
  const [missing, setMissing] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>("loading");

  useEffect(() => {
    if (!plan) return;
    let active = true;
    pendingSubscriptionId.current = null;
    approvedRef.current = false;
    let buttons: { render: (container: HTMLElement | string) => Promise<void>; close?: () => Promise<void> | void } | null = null;
    setKind("loading");
    setMissing([]);
    setMessage("Loading secure PayPal checkout…");

    (async () => {
      const response = await fetch("/api/billing/public-config", { credentials: "same-origin" });
      const config = (await response.json().catch(() => ({}))) as PublicBillingConfig & { error?: string };
      if (!active) return;
      if (!response.ok || !config.configured || config.environment !== "sandbox" || !config.clientId) {
        const gaps = config.missing || [];
        setMissing(gaps);
        /* No production special case: `gaps` names the variable at fault on
           every host, production included, and a sentence about which host
           the Sandbox runs on tells an operator nothing to fix. */
        throw new Error(
          gaps.length
            ? `PayPal Sandbox is not ready. Still to set: ${gaps.join("; ")}.`
            : config.error || "PayPal Sandbox is not fully configured yet.",
        );
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
          // Read the account back so the plan is current in the page behind
          // this dialog — the account modal would otherwise keep showing the
          // old plan until a reload, which looks like a checkout that failed.
          await refreshSession().catch(() => null);
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
          if (!active) return;
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
  }, [plan, interval, attempt]);

  if (!plan) return null;

  const retry = () => {
    resetPayPalSdk();
    setAttempt((value) => value + 1);
  };

  /* Rendered into `document.body`, not into the React tree.
   *
   * The account modal is a `backdrop-blur` element, and a backdrop-filter —
   * like a transform — becomes the containing block for `position: fixed`
   * descendants. A dialog rendered inside it was therefore laid out against
   * the modal's box and its own scroll position instead of the viewport: open
   * it from the plans section, which the modal scrolls to, and it appeared
   * off-screen above the fold — "the checkout does not open". Portalling also
   * lifts it out of the modal's `z-[210]` stacking context, where its
   * `z-[100]` was painting behind the modal it was meant to sit on.
   *
   * Leaving the React tree also means leaving the host page's stylesheet
   * behind, so the classes below come from paypal-checkout.css and not from
   * the studio's utilities. */
  return createPortal(
    <div className="ppc-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ppc-panel" role="dialog" aria-modal="true" aria-labelledby="paypal-checkout-title">
        <div className="ppc-head">
          <div>
            <h2 id="paypal-checkout-title" className="ppc-title">Pay with PayPal</h2>
            <p className="ppc-sub">{plan === "sceneflow" ? "SceneFlow" : "SceneForge"} · {interval === "monthly" ? "monthly" : "yearly"}</p>
          </div>
          <button type="button" onClick={onClose} className="ppc-close" aria-label="Close PayPal checkout">✕</button>
        </div>
        {/* Keyed on the attempt so a retry always renders into an empty node
            instead of stacking a second set of buttons under the first. */}
        <div key={attempt} ref={mountRef} className="ppc-buttons" />
        <p
          role="status"
          aria-live="polite"
          className={`ppc-status ${kind === "error" || kind === "cancelled" ? "is-warn" : kind === "success" ? "is-good" : ""}`}
        >{message}</p>
        {missing.length > 0 && kind === "error" && (
          <ul className="ppc-missing">
            {missing.map((item) => <li key={item}>• {item}</li>)}
          </ul>
        )}
        <div className="ppc-actions">
          {kind === "error" && <button type="button" onClick={retry} className="ppc-btn is-bold">Try again</button>}
          {kind === "success" && <a href="/welcome?payment=paypal" className="ppc-btn is-bold is-primary">Continue</a>}
          {kind !== "success" && <button type="button" onClick={onClose} className="ppc-btn">Close</button>}
        </div>
      </section>
    </div>,
    document.body,
  );
}
