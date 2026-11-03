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

/**
 * How long a PayPal popup the buyer has already clicked may stay silent before
 * the dialog offers the same approval in an ordinary browser tab.
 *
 * PayPal can leave that window blank, or be stopped from opening it at all,
 * without firing onApprove, onError or onCancel — it renders its own
 * "re-launch the window" prompt and nothing reaches us. So the rescue cannot
 * wait for a callback that may never arrive; it is offered on a timer instead.
 * Long enough that a buyer still signing in is not interrupted, short enough
 * that a dead window is not stared at indefinitely.
 */
const POPUP_STALL_MS = 45_000;

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
  /* PayPal's own approval link, straight from the create response. The Smart
     Buttons popup is the normal route, but it renders inside an iframe and can
     hang — blank content, no error, nothing to click — in which case the member
     has no way to finish a payment they have already started. The very same
     subscription can be approved from an ordinary browser tab, so the dialog
     keeps the link and offers it as a way through. */
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  /* True once the buyer has clicked and the popup has stayed silent past
     POPUP_STALL_MS. Until then the rescue stays hidden: offering a way round a
     blank window before the window has had a chance to open stacked a second
     pair of buttons over the ones the member was meant to use. */
  const [popupStalled, setPopupStalled] = useState(false);

  /* Approval can arrive from the popup or from an ordinary browser tab. Either
     way the server decides whether the subscription is real, so both routes ask
     it the same question rather than trusting whichever window happened to
     work. */
  const confirmApproval = async (subscriptionId: string) => {
    approvedRef.current = true;
    pendingSubscriptionId.current = null;
    setChecking(true);
    try {
      const verified = await postJson("/api/billing/paypal/confirm-subscription", { subscriptionId });
      // Read the account back so the plan is current in the page behind this
      // dialog — the account modal would otherwise keep showing the old plan
      // until a reload, which looks like a checkout that failed.
      await refreshSession().catch(() => null);
      if (verified.active) {
        setKind("success");
        setMessage("PayPal confirmed your subscription. Your Scenering plan is active.");
      } else {
        setKind("pending");
        setMessage("PayPal approved the subscription. We are waiting for its verified activation; your plan will unlock as soon as PayPal confirms it.");
      }
    } catch (error: any) {
      setKind("error");
      setMessage(error?.message || "PayPal could not confirm the subscription.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!plan) return;
    let active = true;
    pendingSubscriptionId.current = null;
    approvedRef.current = false;
    let buttons: { render: (container: HTMLElement | string) => Promise<void>; close?: () => Promise<void> | void } | null = null;
    setKind("loading");
    setMissing([]);
    setApproveUrl(null);
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
          if (typeof checkout.approveUrl === "string" && checkout.approveUrl) setApproveUrl(checkout.approveUrl);
          return checkout.subscriptionId;
        },
        onApprove: async (data) => {
          if (!data.subscriptionID) throw new Error("PayPal returned no subscription id.");
          await confirmApproval(data.subscriptionID);
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
        /* Release the checkout, not cancel the subscription. Nothing was
           approved, so there is nothing for PayPal to cancel — the cancel route
           could not succeed here and the pending row stayed standing, which
           locked this account out of a new checkout for the whole window. */
        void postJson("/api/billing/paypal/abandon-checkout", { subscriptionId: pendingSubscriptionId.current }).catch(() => {});
        pendingSubscriptionId.current = null;
      }
      try { void buttons?.close?.(); } catch { /* PayPal may already have closed the dialog. */ }
    };
  }, [plan, interval, attempt]);

  /* Start the stall clock when PayPal hands back an approval link, which is
     when the buyer has clicked and the popup is on its way. Completing,
     cancelling or erroring settles `kind` and the rescue is decided by that;
     unmounting or retrying clears the timer. */
  useEffect(() => {
    if (!approveUrl) return;
    const timer = window.setTimeout(() => setPopupStalled(true), POPUP_STALL_MS);
    return () => window.clearTimeout(timer);
  }, [approveUrl, attempt]);

  if (!plan) return null;

  const retry = () => {
    resetPayPalSdk();
    /* A fresh attempt gets a fresh popup. Drop the previous attempt's approval
       link and stall flag, or the rescue would offer a tab pointing at a
       subscription this attempt never created. */
    setApproveUrl(null);
    setPopupStalled(false);
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
        {approveUrl && kind !== "success" && (kind === "error" || kind === "cancelled" || popupStalled) && (
          /* The popup is an iframe the member cannot inspect, so when it hangs
             there is nothing to click and no error to read — and when the
             browser stops it opening at all, PayPal renders its own
             "re-launch the window" prompt into the button container and no
             callback arrives either. This is the same approval on PayPal's own
             site, in a real tab, and afterwards the server is asked the same
             question the popup would have triggered.

             Reached only by a failure that has actually happened: an error, a
             cancellation, or POPUP_STALL_MS of silence after the click. It
             sits below the primary actions rather than above them, so the
             buttons the member is meant to use are what they see first. */
          <>
            <p className="ppc-status">The PayPal window has not reported back. If it is blank or never opened, the same approval can be finished in a browser tab.</p>
            <div className="ppc-actions">
              <a href={approveUrl} target="_blank" rel="noopener noreferrer" className="ppc-btn">PayPal window blank? Open it in a new tab</a>
              <button
                type="button"
                className="ppc-btn is-bold"
                disabled={checking}
                onClick={() => { if (pendingSubscriptionId.current) void confirmApproval(pendingSubscriptionId.current); }}
              >{checking ? "Checking with PayPal…" : "I approved it — check my plan"}</button>
            </div>
          </>
        )}
      </section>
    </div>,
    document.body,
  );
}
