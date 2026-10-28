import { useEffect, useRef, useState } from "react";
import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval, type PlanSlug } from "../config/plans";
import { navigate } from "../lib/route";
import { getInterfacePlan, getSession, setAdminPlanPreview, signOut, useSession } from "../lib/session";
import { EMPTY_SOCIAL_LINKS, invalidateSocialLinks, SocialIcon, SOCIAL_ICONS, type SocialLinkSet } from "../shared/SocialLinks";
import StoreNoticeBanner, { DEFAULT_STORE_NOTICE, invalidateStoreNotice, STORE_NOTICE_MAX_BADGE_LENGTH, STORE_NOTICE_MAX_MESSAGE_LENGTH, type StoreNotice } from "../shared/StoreNotice";
import Icon from "./icons/Icon";
import ApiKeysModal from "./ApiKeysModal";
import { useApiKeysConfigured } from "../shared/api-key-status";
import { useLocalizedPlanPrices } from "../lib/use-localized-prices";
import PayPalSubscriptionDialog from "./PayPalSubscriptionDialog";

type AccountPayload = {
  user: { email: string; displayName: string; emailVerified: boolean; role: "user" | "admin" };
  membership: { plan_id: PlanSlug; status: string; source?: string; complimentary_ends_at?: string | null; complimentary_period?: "month" | "year" | null };
  subscription?: { provider?: string; subscription_id?: string | null; customer_id?: string | null; subscription_status?: string; price_id?: string | null; product_id?: string | null; status: string; billing_interval: BillingInterval; current_period_end?: string; expires_at?: string; cancel_at_period_end?: boolean; customer_portal_url?: string; update_payment_url?: string; card_brand?: string; card_last_four?: string } | null;
  has_billing_customer?: boolean;
  usage?: { finalExports: number; finalExportMinutes: number };
  /** Where this membership is signed in. The plan sets the limit; a phone
   *  counts like any other device. */
  devices?: { limit: number; active: number; list: Array<{ label: string; platform: string; lastSeenAt: string; current: boolean }> };
  remaining?: { finalExports: number | null; shortExports: number | null; longExports: number | null };
};

export default function AccountMembershipModal({ isOpen, onClose, focusPlans = false, focusAdmin = false }: { isOpen: boolean; onClose: () => void; focusPlans?: boolean; focusAdmin?: boolean }) {
  const plansRef = useRef<HTMLElement | null>(null);
  const adminRef = useRef<HTMLElement | null>(null);
  const { account: sessionAccount } = useSession();
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [paypalChoice, setPaypalChoice] = useState<{ plan: "sceneflow" | "sceneforge"; interval: BillingInterval } | null>(null);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [adminData, setAdminData] = useState<any>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantPlan, setGrantPlan] = useState<"sceneflow" | "sceneforge">("sceneflow");
  const [grantPeriod, setGrantPeriod] = useState<"month" | "year">("month");
  const [codePlan, setCodePlan] = useState<"sceneflow" | "sceneforge">("sceneflow");
  const [codeValidity, setCodeValidity] = useState<7 | 30 | 90>(30);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; redeemUrl: string; expiresAt: string } | null>(null);
  const [redeemCode, setRedeemCode] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLinkSet>({ ...EMPTY_SOCIAL_LINKS });
  const [socialStatus, setSocialStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [storeNotice, setStoreNotice] = useState<StoreNotice>({ ...DEFAULT_STORE_NOTICE });
  const [storeNoticeStatus, setStoreNoticeStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  /* The provider-key dialog. It is opened from here as well as from the corner
     menu; both entries lead to the same dialog and the same stored keys. */
  const [keysOpen, setKeysOpen] = useState(false);
  const hasOwnKeys = useApiKeysConfigured();
  /* Load public billing configuration only while this window is open. */
  const { displayPrice, annualSavingLine } = useLocalizedPlanPrices(isOpen);

  async function refreshAdmin() {
    const response = await fetch("/api/admin/overview");
    if (!response.ok) throw new Error("Admin overview could not be loaded.");
    setAdminData(await response.json());
    const links = await fetch("/api/social-links").then((r) => r.ok ? r.json() : null).catch(() => null);
    if (links?.links) setSocialLinks({ ...EMPTY_SOCIAL_LINKS, ...links.links });
    const noticeRes = await fetch("/api/store-notice").then((r) => r.ok ? r.json() : null).catch(() => null);
    if (noticeRes?.notice) setStoreNotice({ ...DEFAULT_STORE_NOTICE, ...noticeRes.notice });
  }

  async function saveStoreNotice() {
    setBusy("store-notice"); setStoreNoticeStatus(null);
    const response = await fetch("/api/admin/store-notice", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(storeNotice),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStoreNoticeStatus({ tone: "error", text: data.error || "Store notice could not be saved." });
    } else {
      const next: StoreNotice = { ...DEFAULT_STORE_NOTICE, ...data.notice };
      setStoreNotice(next);
      invalidateStoreNotice(next);
      setStoreNoticeStatus({
        tone: "ok",
        text: next.enabled
          ? "Saved. The store notice is now shown at the top of the front pages."
          : "Saved. The store notice is now hidden on the front pages.",
      });
    }
    setBusy(null);
  }

  async function saveSocialLinks() {
    setBusy("social-links"); setSocialStatus(null);
    /* An address copied from a browser bar often arrives without a scheme;
       treat it as https rather than failing a save over a missing prefix. */
    const normalized = Object.fromEntries(Object.entries(socialLinks).map(([key, value]) => { const trimmed = String(value || "").trim(); return [key, !trimmed || /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`]; })) as SocialLinkSet;
    const response = await fetch("/api/admin/social-links", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(normalized) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setSocialStatus({ tone: "error", text: data.error || "Social links could not be saved." });
    else { setSocialLinks({ youtube: "", facebook: "", linkedin: "", x: "", ...data.links }); invalidateSocialLinks(); setSocialStatus({ tone: "ok", text: "Saved. The icons on the website footers and the app menu now show these addresses." }); }
    setBusy(null);
  }

  useEffect(() => {
    if (!isOpen) return;
    setNotice("");
    Promise.all([
      fetch("/api/account").then((r) => r.ok ? r.json() : Promise.reject(new Error("Please sign in again."))),
      fetch("/api/email-preferences").then((r) => r.ok ? r.json() : null),
    ]).then(([next, preferences]) => {
      setAccount(next);
      // The API returns the camelCase preference row (src/db.ts's mapper);
      // both spellings are accepted in case a cached older shape appears.
      setMarketingConsent(Boolean(preferences?.marketingConsent ?? preferences?.marketing_consent));
      if (next.user?.role === "admin") void refreshAdmin().catch((error) => setNotice(error.message));
    }).catch((error) => setNotice(error.message));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !focusPlans) return;
    const timer = window.setTimeout(() => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, focusPlans]);

  /* "Owner administration" in the corner menu lands on the administration
     section instead of the top of the modal — previously both menu buttons
     opened the identical view. The admin data loads async, so wait for the
     section to exist before scrolling to it. */
  useEffect(() => {
    if (!isOpen || !focusAdmin) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (adminRef.current) { adminRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); window.clearInterval(timer); }
      else if (tries > 40) window.clearInterval(timer);
    }, 100);
    return () => window.clearInterval(timer);
  }, [isOpen, focusAdmin]);

  if (!isOpen) return null;
  const isOwnerAdmin = account?.user.role === "admin" || account?.membership?.source === "owner_admin" || getSession()?.user.role === "admin";
  const authoritativePlan = account?.membership?.plan_id || getSession()?.membership?.plan_id || "free";
  const currentPlan = isOwnerAdmin ? getInterfacePlan(sessionAccount) : authoritativePlan;
  const isPreviewingPlan = isOwnerAdmin && currentPlan !== authoritativePlan;
  const enterStudio = () => { if (window.location.pathname === "/app" && window.location.search) history.replaceState({}, "", "/app"); onClose(); };

  function choosePlan(plan: PlanSlug) {
    if (plan === "free") { setNotice("Free is always available. Paid subscriptions return to Free when verified paid access ends."); return; }
    if (!import.meta.env.DEV) {
      setNotice("Paid checkout is disabled while PayPal is Sandbox-only. Production billing has not been enabled.");
      return;
    }
    setNotice("");
    setPaypalChoice({ plan, interval });
  }

  async function cancelPayPalSubscription() {
    if (!window.confirm("Cancel this PayPal subscription? Paid access will continue until the current billing period ends.")) return;
    setBusy("paypal-cancel"); setNotice("");
    try {
      const response = await fetch("/api/billing/paypal/cancel-subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The PayPal subscription could not be cancelled.");
      const refreshed = await fetch("/api/account").then((result) => result.ok ? result.json() : null);
      if (refreshed) setAccount(refreshed);
      setNotice("PayPal cancellation was requested. Access remains until the current paid period ends.");
    } catch (error: any) { setNotice(error.message || "The PayPal subscription could not be cancelled."); }
    finally { setBusy(null); }
  }


  async function copyGiftText(value: string, label: string) {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const field = document.createElement("textarea"); field.value = value; field.style.position = "fixed"; field.style.opacity = "0"; document.body.appendChild(field); field.select(); document.execCommand("copy"); field.remove();
      }
      setNotice(`${label} copied.`);
    } catch { setNotice(`Copy was blocked by this browser. Select and copy this manually: ${value}`); }
  }

  async function createAccessCode() {
    setBusy("create-code"); setNotice(""); setGeneratedCode(null);
    const response = await fetch("/api/admin/complimentary-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: codePlan, validForDays: codeValidity }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setNotice(data.error || "Access code could not be created.");
    else { setGeneratedCode(data); setNotice("One-time complimentary access code created. Copy it now; the full code is not stored for later display."); await refreshAdmin(); }
    setBusy(null);
  }

  async function revokeAccessCode(codeId: string) {
    setBusy(`code-${codeId}`); const response = await fetch(`/api/admin/complimentary-codes/${codeId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    setNotice(response.ok ? "Access code revoked." : "Access code could not be revoked."); if (response.ok) await refreshAdmin(); setBusy(null);
  }

  async function redeemAccessCode() {
    setBusy("redeem-code"); setNotice("");
    const response = await fetch("/api/complimentary-codes/redeem", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: redeemCode }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setNotice(data.error || "Access code could not be redeemed.");
    else { setNotice(`Complimentary ${PLAN_CONFIG[data.membership.plan_id as PlanSlug].name} access is active until ${new Date(data.grant.ends_at).toLocaleDateString()}.`); setRedeemCode(""); window.location.reload(); }
    setBusy(null);
  }

  async function grantComplimentary(userId: string | null, planId: "sceneflow" | "sceneforge", period: "month" | "year", email?: string) {
    const busyKey = userId ? `grant-${userId}` : "grant-email";
    setBusy(busyKey); setNotice("");
    const response = await fetch("/api/admin/complimentary-memberships", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, email, planId, period, reason: "Complimentary membership granted by owner administrator" }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setNotice(data.error || "Complimentary membership could not be granted.");
    else { setNotice(`${data.recipient.displayName} now has complimentary ${PLAN_CONFIG[planId].name} access until ${new Date(data.grant.ends_at).toLocaleDateString()}.`); setGrantEmail(""); await refreshAdmin(); }
    setBusy(null);
  }

  async function revokeComplimentary(grantId: string) {
    setBusy(`revoke-${grantId}`); setNotice("");
    const response = await fetch(`/api/admin/complimentary-memberships/${grantId}/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setNotice(data.error || "Complimentary membership could not be revoked.");
    else { setNotice("Complimentary membership revoked. Any verified paid subscription remains unchanged."); await refreshAdmin(); }
    setBusy(null);
  }


  async function saveEmailPreference(value: boolean) {
    setMarketingConsent(value);
    const response = await fetch("/api/email-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marketingConsent: value }) });
    const data = await response.json().catch(() => ({}));
    setNotice(response.ok ? "Email preference saved." : data.error || "Could not save email preference.");
  }

  return <div className="fixed inset-0 z-[210] bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={(e) => { if (e.target === e.currentTarget) enterStudio(); }}>
    <div className="w-full max-w-6xl my-auto bg-gray-950 border border-hairline rounded-2xl shadow-2xl text-white overflow-hidden">
      <header className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-hairline bg-gray-900/80">
        <div><span className="text-[11px] uppercase tracking-[.18em] text-indigo-300 font-bold">Account & Membership</span><h2 id="account-title" className="text-2xl font-bold mt-1">{account?.user.displayName || "Your Scenering account"}</h2><p className="text-sm text-gray-400 mt-1">{account?.user.email || "Loading account…"}</p></div>
        <div className="flex flex-wrap items-center gap-2"><button type="button" className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold hover:bg-gray-800" onClick={async () => { await signOut(); onClose(); navigate("/login"); }}>Switch account</button><button className="rounded-lg bg-white text-blue-950 px-3 py-2 text-xs font-extrabold shadow-md hover:bg-blue-50" onClick={enterStudio}>Enter Studio</button><button className="opt-btn" onClick={enterStudio} aria-label="Close account and membership and enter Studio"><Icon glyph="✕" /></button></div>
      </header>

      <div className="p-5 sm:p-6 space-y-6">
        <section className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-indigo-700/60 bg-indigo-950/40 p-4"><div className="text-xs text-indigo-300">{isPreviewingPlan ? "Interface preview" : "Current membership"}</div><div className="text-xl font-bold mt-1">{PLAN_CONFIG[currentPlan].name}</div><div className="text-xs text-gray-400 mt-1">{account?.membership?.source === "complimentary" ? `Complimentary until ${new Date(account.membership.complimentary_ends_at!).toLocaleDateString()}` : account?.membership?.source === "owner_admin" ? "Owner administrator access" : account?.membership?.status || "active"}</div></div>
          <div className="rounded-xl border border-hairline bg-gray-900/70 p-4"><div className="text-xs text-gray-400">This week</div><div className="text-xl font-bold mt-1">{account?.usage?.finalExports ?? 0} final export{account?.usage?.finalExports === 1 ? "" : "s"}</div><div className="text-xs text-gray-400 mt-1">Preview renders are not counted</div></div>
          <div className="rounded-xl border border-hairline bg-gray-900/70 p-4">
            <div className="text-xs text-gray-400">Subscription</div>
            <div className="text-xl font-bold mt-1 capitalize">{(account?.subscription?.status || "No paid subscription").replace(/_/g, " ")}</div>
            {/* Provider self-service, renewal timing and cancellation controls for the stored subscription. */}
            {account?.subscription?.cancel_at_period_end && <div className="text-xs text-amber-300 mt-1">Cancelled — access continues until the paid period ends</div>}
            {/* A verified failed recurring payment is surfaced while the server applies the provider's retry/access policy. */}
            {account?.subscription?.provider === "paypal" && account.subscription.status === "past_due" && <div className="text-xs text-amber-300 mt-1">Payment failed — your plan continues while PayPal retries the payment. Review your Sandbox subscription in PayPal.</div>}
            {account?.subscription?.provider === "paypal" && account.subscription.status === "suspended" && <div className="text-xs text-amber-300 mt-1">Suspended — review the subscription in PayPal Sandbox.</div>}
            {(account?.subscription?.expires_at || account?.subscription?.current_period_end) && <div className="text-xs text-gray-400 mt-1">{account?.subscription?.cancel_at_period_end ? "Ends" : "Renews"} {new Date(account.subscription.expires_at || account.subscription.current_period_end!).toLocaleDateString()}</div>}
            {account?.subscription?.provider === "paypal" && account.subscription.card_last_four && <div className="text-xs text-gray-500 mt-1 capitalize">{account.subscription.card_brand || "Payment method"} ending {account.subscription.card_last_four}</div>}
            {account?.subscription?.provider && account.subscription.provider !== "paypal" && <div className="text-xs text-gray-400 mt-2">Historical subscription details are retained. Billing management for this record is unavailable in Scenering; contact support if you need help.</div>}
            {account?.subscription || account?.has_billing_customer ? <div className="flex flex-wrap gap-2 mt-3">
              {account?.subscription?.provider === "paypal" && account.subscription.customer_portal_url && <a className="opt-btn text-xs" href={account.subscription.customer_portal_url} target="_blank" rel="noopener noreferrer">Manage in PayPal</a>}
              {account?.subscription?.provider === "paypal" && account.subscription.update_payment_url && <a className="opt-btn text-xs" href={account.subscription.update_payment_url} target="_blank" rel="noopener noreferrer">Update payment method in PayPal</a>}
              {account?.subscription?.provider === "paypal" && !account.subscription.cancel_at_period_end && !["cancelled", "expired"].includes(account.subscription.status) && <button type="button" className="opt-btn text-xs" disabled={busy === "paypal-cancel"} onClick={() => void cancelPayPalSubscription()}>{busy === "paypal-cancel" ? "Cancelling…" : "Cancel PayPal subscription"}</button>}
            </div> : <div className="text-xs text-gray-400 mt-1">Verified PayPal subscription state controls paid access</div>}
          </div>
        </section>

        {/* Where the membership is signed in. A plan's device count is a
            benefit, not a hidden ceiling: the member can see every device, see
            which one this is, and understand which machine will be signed out
            when the next one opens. Projects are shared between all of them. */}
        {account?.devices && (
          <section className="rounded-xl border border-hairline bg-gray-900/60 p-4" aria-label="Devices">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-gray-400">Devices signed in</div>
                <div className="text-sm font-bold mt-1">{account.devices.active} of {account.devices.limit} used</div>
              </div>
              <div className="text-[11px] text-gray-500 text-right max-w-[16rem]">Your projects are shared between these devices. Opening Scenering on one more than your plan allows signs out the device that has been idle longest.</div>
            </div>
            <ul className="mt-3 space-y-1.5">
              {account.devices.list.map((device, index) => (
                <li key={`${device.label}-${index}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-gray-200">{device.label}{device.current ? <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-300">This device</span> : null}</span>
                  <span className="shrink-0 text-gray-500">{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "recently"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Provider keys. Optional, browser-held (never sent anywhere but the
            provider's own verification call), and useful to exactly the people
            who come looking for them — so they are offered here rather than
            occupying a button in the studio's top bar. */}
        <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-hairline bg-gray-900/60 p-4" aria-label="API keys">
          <div className="flex items-start gap-3">
            <span className="text-xl"><Icon glyph="🔑" /></span>
            <div>
              <h3 className="text-sm font-bold">Pexels and Pixabay search keys</h3>
              <p className="text-xs text-gray-400 mt-1">Optional personal stock-image keys. They are stored in this browser, and server-configured keys are used wherever yours are absent.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 md:flex-shrink-0">
            <span className={`text-[10px] uppercase tracking-wider ${hasOwnKeys ? "text-emerald-300" : "text-amber-300"}`}>{hasOwnKeys ? "Keys saved" : "Not set"}</span>
            <button type="button" className="opt-btn" onClick={() => setKeysOpen(true)}>{hasOwnKeys ? "Manage keys" : "Add keys"}</button>
          </div>
        </section>

        {isOwnerAdmin && <section ref={adminRef} className="rounded-xl border border-blue-500/60 bg-blue-950/25 p-4 sm:p-5 space-y-5" aria-label="Owner administration">
          <div><span className="text-[10px] uppercase tracking-[.16em] text-blue-300 font-bold">Owner administrator</span><h3 className="text-lg font-bold mt-1">Scenering administration</h3><p className="text-xs text-gray-400">Full SceneForge access plus customer, contact, email-consent and production configuration visibility. Secrets and password hashes are never displayed.</p></div>
          <div className="rounded-xl border border-indigo-400/50 bg-gray-950/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div><h4 className="text-sm font-bold">Email Centre</h4><p className="text-xs text-gray-400 mt-1">Branded marketing templates, consented audiences, campaigns with preview and test sends, and delivery history. Opens in its own admin page.</p></div>
            <a href="/admin/email-centre" className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-2 text-xs font-bold whitespace-nowrap">Open Email Centre</a>
          </div>
          <div className="rounded-xl border border-indigo-400/50 bg-gray-950/70 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div><h4 className="text-sm font-bold">Preview the Studio as a customer plan</h4><p className="text-xs text-gray-400 mt-1">Switch the interface to inspect Free, SceneFlow or SceneForge badges and upgrade prompts. This does not change your owner rights, billing or authoritative SceneForge access.</p></div>
              <span className="text-[10px] uppercase tracking-wider text-indigo-200">Viewing {PLAN_CONFIG[currentPlan].name}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3">{PLAN_ORDER.map((slug) => <button key={slug} type="button" onClick={() => setAdminPlanPreview(slug)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${currentPlan === slug ? "border-white bg-white text-blue-950" : "border-white/15 bg-blue-950/40 text-white hover:bg-blue-900/60"}`}>{PLAN_CONFIG[slug].name}</button>)}</div>
            {isPreviewingPlan && <p className="text-[11px] text-amber-200 mt-3">Preview mode is active. Final authorization still recognizes your protected owner access.</p>}
          </div>
          <form className="rounded-xl border border-blue-400/70 bg-blue-950/55 p-4 sm:p-5 shadow-lg" onSubmit={(event) => { event.preventDefault(); void createAccessCode(); }}>
            <span className="text-[10px] uppercase tracking-[.16em] text-blue-300 font-bold">Gift membership</span>
            <h4 className="text-lg font-bold mt-1">Generate a one-year gift access code</h4>
            <p className="text-xs text-gray-300 mt-1 mb-4">Choose SceneFlow or SceneForge and generate the code here. Send the code or registration link to someone without an account. They create and verify their account, then claim the one-year gift.</p>
            <div className="grid sm:grid-cols-[auto_auto_auto] gap-2">
              <select value={codePlan} onChange={(event) => setCodePlan(event.target.value as "sceneflow" | "sceneforge")} className="rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs"><option value="sceneflow">Gift SceneFlow for one year</option><option value="sceneforge">Gift SceneForge for one year</option></select>
              <select value={codeValidity} onChange={(event) => setCodeValidity(Number(event.target.value) as 7 | 30 | 90)} className="rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs"><option value={7}>Claim within 7 days</option><option value={30}>Claim within 30 days</option><option value={90}>Claim within 90 days</option></select>
              <button type="submit" disabled={busy === "create-code"} className="rounded-lg bg-white text-blue-950 px-4 py-2 text-xs font-extrabold hover:bg-blue-50 disabled:opacity-60">{busy === "create-code" ? "Generating…" : "Generate gift code"}</button>
            </div>
            {generatedCode && <div className="mt-4 rounded-lg border border-emerald-500/50 bg-emerald-950/35 p-4"><div className="text-[10px] uppercase tracking-wider text-emerald-300">Gift code created — copy it now</div><code className="block text-base font-bold text-white break-all mt-1">{generatedCode.code}</code><div className="flex flex-wrap gap-2 mt-3"><button type="button" onClick={() => void copyGiftText(generatedCode.code, "Gift code")} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-bold">Copy gift code</button><button type="button" onClick={() => void copyGiftText(new URL(generatedCode.redeemUrl, window.location.origin).toString(), "Gift registration link")} className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-xs font-bold">Copy gift registration link</button></div><div className="text-[10px] text-gray-400 mt-2">The code must be claimed by {new Date(generatedCode.expiresAt).toLocaleDateString()}. The one-year membership starts when claimed.</div></div>}
          </form>
          <form className="rounded-xl border border-amber-400/60 bg-gray-950/70 p-4 sm:p-5" aria-label="Store notice" onSubmit={(event) => { event.preventDefault(); void saveStoreNotice(); }}>
            <span className="text-[10px] uppercase tracking-[.16em] text-amber-300 font-bold">Store notice</span>
            <h4 className="text-lg font-bold mt-1">Front-page store notice banner</h4>
            <p className="text-xs text-gray-400 mt-1 mb-4">Display a compact, bright notice ribbon right beneath the top navigation bar across the front pages. Toggle it on or off and edit the badge and message below.</p>
            <label className="flex items-center gap-2.5 text-xs font-bold text-gray-200 mb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={storeNotice.enabled}
                onChange={(event) => setStoreNotice((previous) => ({ ...previous, enabled: event.target.checked }))}
              />
              <span>Show store notice on front pages</span>
            </label>
            <div className="grid sm:grid-cols-[220px_1fr] gap-3">
              <label className="block">
                <span className="block text-xs font-bold text-gray-300">Notice badge</span>
                <input
                  type="text"
                  maxLength={STORE_NOTICE_MAX_BADGE_LENGTH}
                  placeholder={DEFAULT_STORE_NOTICE.badge}
                  value={storeNotice.badge}
                  onChange={(event) => setStoreNotice((previous) => ({ ...previous, badge: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-600"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-bold text-gray-300">Notice message</span>
                <input
                  type="text"
                  maxLength={STORE_NOTICE_MAX_MESSAGE_LENGTH}
                  placeholder={DEFAULT_STORE_NOTICE.message}
                  value={storeNotice.message}
                  onChange={(event) => setStoreNotice((previous) => ({ ...previous, message: event.target.value }))}
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-600"
                />
              </label>
            </div>
            {storeNotice.enabled && storeNotice.message.trim() && (
              <div className="mt-3 rounded-lg overflow-hidden border border-amber-400/40">
                <StoreNoticeBanner previewNotice={storeNotice} />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button type="submit" disabled={busy === "store-notice"} className="rounded-lg bg-white text-blue-950 px-4 py-2 text-xs font-extrabold hover:bg-blue-50 disabled:opacity-60">{busy === "store-notice" ? "Saving…" : "Save store notice"}</button>
              <button type="button" onClick={() => setStoreNotice({ ...DEFAULT_STORE_NOTICE })} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-gray-300 hover:bg-white/5">Reset to default</button>
              {storeNoticeStatus
                ? <span role="status" className={`text-xs font-bold ${storeNoticeStatus.tone === "ok" ? "text-emerald-300" : "text-amber-300"}`}>{storeNoticeStatus.text}</span>
                : <span className="text-[10px] text-gray-500">Saved immediately for every visitor on the front pages.</span>}
            </div>
          </form>
          <form className="rounded-xl border border-white/15 bg-gray-950/70 p-4 sm:p-5" aria-label="Social media links" onSubmit={(event) => { event.preventDefault(); void saveSocialLinks(); }}>
            <span className="text-[10px] uppercase tracking-[.16em] text-blue-300 font-bold">Social media</span>
            <h4 className="text-lg font-bold mt-1">Website and app social links</h4>
            <p className="text-xs text-gray-400 mt-1 mb-4">Paste the full https:// address of each profile. A saved link shows its original platform icon in the website footers and the app menu; leaving a field empty hides that icon everywhere. Each address must point at the platform's own domain.</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {SOCIAL_ICONS.map((platform) => (
                <label key={platform.id} className="block">
                  <span className="flex items-center gap-2 text-xs font-bold text-gray-300"><SocialIcon id={platform.id} size={16} />{platform.label} URL</span>
                  <input
                    type="text"
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder={platform.placeholder}
                    value={socialLinks[platform.id]}
                    onChange={(event) => setSocialLinks((previous) => ({ ...previous, [platform.id]: event.target.value }))}
                    className="mt-1.5 w-full rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-600"
                  />
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-4">
              <button type="submit" disabled={busy === "social-links"} className="rounded-lg bg-white text-blue-950 px-4 py-2 text-xs font-extrabold hover:bg-blue-50 disabled:opacity-60">{busy === "social-links" ? "Saving…" : "Save social links"}</button>
              {socialStatus
                ? <span role="status" className={`text-xs font-bold ${socialStatus.tone === "ok" ? "text-emerald-300" : "text-amber-300"}`}>{socialStatus.text}</span>
                : <span className="text-[10px] text-gray-500">Saved immediately for every visitor. No link is shown until it is saved here.</span>}
            </div>
          </form>
          {adminData ? <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{Object.entries(adminData.configuration || {}).map(([key, value]) => <div key={key} className="rounded-lg border border-white/10 bg-gray-950/60 p-3"><div className="text-[10px] text-gray-500 break-words">{key.replace(/([A-Z])/g, " $1")}</div><b className={value ? "text-emerald-300" : "text-amber-300"}>{value ? "Yes" : "No"}</b></div>)}</div>
            {adminData.paypal && <div className="rounded-lg border border-white/10 bg-gray-950/60 p-4">
              <h4 className="text-sm font-bold">PayPal subscription Sandbox — no Live cutover</h4>
              <p className="mt-2 text-[11px] text-amber-200">Verify the callback is publicly reachable before registering it in PayPal Sandbox. This dashboard does not register webhooks; Live billing remains disabled.</p>
              <div className="mt-2 text-[11px] text-gray-400">Callback path: <code>{adminData.paypal.webhookPath}</code> · Candidate: <code className="break-all">{adminData.paypal.webhookUrl || "Set PUBLIC_APP_URL and verify reachability"}</code></div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-xs">{[["PAYPAL_CLIENT_ID", adminData.paypal.clientIdSet], ["PAYPAL_CLIENT_SECRET", adminData.paypal.clientSecretSet], ["PAYPAL_WEBHOOK_ID", adminData.paypal.webhookIdSet], ["PUBLIC_APP_URL", adminData.paypal.publicAppUrlSet]].map(([name, done]: any) => <div key={name} className="rounded-md border border-white/10 bg-gray-900/60 p-2"><code className="text-[10px] text-gray-500">{name}</code><b className={`block ${done ? "text-emerald-300" : "text-amber-300"}`}>{done ? "Set" : "Missing"}</b></div>)}</div>
              <div className="grid sm:grid-cols-2 gap-2 mt-3 text-xs">{adminData.paypal.plans.map((item: any) => <div key={`${item.plan}-${item.interval}`} className="rounded-md border border-white/10 bg-gray-900/60 p-2"><b>{item.planName} · {item.interval}</b><code className="block break-all text-gray-300">{item.planId || "Sandbox plan ID missing"}</code></div>)}</div>
            </div>}
            {adminData.complimentaryCodes?.length > 0 && <div><h4 className="text-sm font-bold mb-2">Access codes</h4><div className="flex flex-wrap gap-2">{adminData.complimentaryCodes.map((code: any) => <div key={code.id} className="rounded-lg border border-white/10 bg-gray-950/60 p-3 text-xs"><b>{code.code_prefix}</b><span className="block text-gray-400 capitalize">{code.plan_id} · {code.period} · {code.status}</span><span className="block text-gray-500">expires {new Date(code.expires_at).toLocaleDateString()}</span>{code.status === "active" && <button disabled={busy === `code-${code.id}`} type="button" onClick={() => void revokeAccessCode(code.id)} className="mt-2 rounded-md border border-white/15 px-2 py-1 hover:bg-gray-800">Revoke unused code</button>}</div>)}</div></div>}
            <form className="rounded-lg border border-blue-500/30 bg-gray-950/60 p-4" onSubmit={(event) => { event.preventDefault(); void grantComplimentary(null, grantPlan, grantPeriod, grantEmail); }}><h4 className="text-sm font-bold">Grant complimentary membership</h4><p className="text-[11px] text-gray-400 mt-1 mb-3">The customer must already have a verified Scenering account. No payment is created.</p><div className="grid sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto] gap-2"><input type="email" required value={grantEmail} onChange={(event) => setGrantEmail(event.target.value)} placeholder="Customer account email" className="min-w-0 rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs text-white" /><select value={grantPlan} onChange={(event) => setGrantPlan(event.target.value as "sceneflow" | "sceneforge")} className="rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs"><option value="sceneflow">SceneFlow</option><option value="sceneforge">SceneForge</option></select><select value={grantPeriod} onChange={(event) => setGrantPeriod(event.target.value as "month" | "year")} className="rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs"><option value="month">1 month</option><option value="year">1 year</option></select><button type="submit" disabled={busy === "grant-email"} className="rounded-lg bg-white text-blue-950 px-4 py-2 text-xs font-extrabold hover:bg-blue-50 disabled:opacity-60">{busy === "grant-email" ? "Granting…" : "Grant access"}</button></div></form>
            <div><h4 className="text-sm font-bold mb-2">Accounts, email consent and complimentary access</h4><div className="overflow-x-auto rounded-lg border border-white/10"><table className="w-full text-xs"><thead className="bg-gray-950"><tr><th className="text-left p-2">Customer</th><th className="text-left p-2">Role</th><th className="text-left p-2">Effective plan</th><th className="text-left p-2">Marketing</th><th className="text-left p-2">Complimentary membership</th></tr></thead><tbody>{adminData.users.map((user: any) => <tr key={user.id} className="border-t border-white/10 align-top"><td className="p-2"><b className="block">{user.displayName}</b><span className="text-gray-400">{user.email}</span></td><td className="p-2 capitalize">{user.role}</td><td className="p-2 capitalize"><b>{user.membership?.plan_id || "free"}</b>{user.membership?.source && <span className="block text-[10px] text-gray-500">{String(user.membership.source).replace(/_/g, " ")}</span>}{user.complimentaryGrant && <span className="block text-[10px] text-blue-300">until {new Date(user.complimentaryGrant.ends_at).toLocaleDateString()}</span>}</td><td className="p-2">{user.marketingConsent ? "Consented" : "No consent"}</td><td className="p-2 min-w-64">{user.role === "admin" ? <span className="text-gray-500">Owner access does not expire</span> : user.complimentaryGrant ? <div className="flex flex-wrap items-center gap-2"><span className="text-blue-200">{PLAN_CONFIG[user.complimentaryGrant.plan_id as PlanSlug].name} · {user.complimentaryGrant.period}</span><button disabled={busy === `revoke-${user.complimentaryGrant.id}`} onClick={() => void revokeComplimentary(user.complimentaryGrant.id)} className="rounded-md border border-white/15 px-2 py-1 hover:bg-gray-800">{busy === `revoke-${user.complimentaryGrant.id}` ? "Revoking…" : "Revoke"}</button></div> : <div className="flex flex-wrap gap-1"><button disabled={busy === `grant-${user.id}`} onClick={() => void grantComplimentary(user.id, "sceneflow", "month")} className="rounded-md bg-blue-700 px-2 py-1 hover:bg-blue-600">Flow · 1 month</button><button disabled={busy === `grant-${user.id}`} onClick={() => void grantComplimentary(user.id, "sceneflow", "year")} className="rounded-md bg-blue-700 px-2 py-1 hover:bg-blue-600">Flow · 1 year</button><button disabled={busy === `grant-${user.id}`} onClick={() => void grantComplimentary(user.id, "sceneforge", "month")} className="rounded-md bg-white text-blue-950 px-2 py-1 hover:bg-blue-50">Forge · 1 month</button><button disabled={busy === `grant-${user.id}`} onClick={() => void grantComplimentary(user.id, "sceneforge", "year")} className="rounded-md bg-white text-blue-950 px-2 py-1 hover:bg-blue-50">Forge · 1 year</button></div>}</td></tr>)}</tbody></table></div><p className="text-[11px] text-gray-500 mt-2">A complimentary grant changes access only; it does not create a charge or alter a verified provider subscription. A new grant replaces any active complimentary grant for that account.</p></div>
            <div><h4 className="text-sm font-bold mb-2">Contact inbox</h4>{adminData.inbox && adminData.inbox.total > 0 ? <p className="text-xs text-gray-300">{adminData.inbox.needsReply > 0 ? `${adminData.inbox.needsReply} ${adminData.inbox.needsReply === 1 ? "conversation is" : "conversations are"} waiting for your reply.` : "Every conversation has been answered."} <a href="/admin?tab=inbox" className="font-bold text-indigo-300 underline">Open the Inbox in the Email Centre</a>, where contact messages and email to your address are answered.</p> : adminData.contacts.length ? <p className="text-xs text-gray-300"><a href="/admin?tab=inbox" className="font-bold text-indigo-300 underline">Open the Inbox in the Email Centre</a> to read and answer your contact messages.</p> : <p className="text-xs text-gray-400">No contact messages have been received.</p>}</div>
          </> : <p className="text-sm text-gray-400">Loading secure administration data…</p>}
        </section>}

        {account && !isOwnerAdmin && <form className="rounded-xl border border-blue-700/50 bg-blue-950/20 p-4" onSubmit={(event) => { event.preventDefault(); void redeemAccessCode(); }}><h3 className="text-sm font-bold">Have a complimentary access code?</h3><p className="text-xs text-gray-400 mt-1 mb-3">Redeem a one-time code from Scenering to activate the included membership period.</p><div className="flex flex-col sm:flex-row gap-2"><input required value={redeemCode} onChange={(event) => setRedeemCode(event.target.value)} placeholder="SCN-…" className="flex-1 rounded-lg border border-white/15 bg-gray-950 px-3 py-2 text-sm uppercase" /><button disabled={busy === "redeem-code"} className="rounded-lg bg-white text-blue-950 px-4 py-2 text-xs font-extrabold">{busy === "redeem-code" ? "Redeeming…" : "Redeem code"}</button></div></form>}

        <section ref={plansRef}>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4"><div><span className="vip-flame"><span className="vip-flame-mark" aria-hidden="true">✦</span>VIP creative access</span><h3 className="text-lg font-bold mt-1">Choose the capacity that fits</h3><p className="text-sm text-gray-400">Preview VIP tools in your project, then choose SceneFlow or SceneForge to include them in final downloads.</p></div><div className="inline-flex rounded-lg bg-gray-900 border border-hairline p-1 self-start"><button className={`px-3 py-1.5 text-xs rounded-md ${interval === "monthly" ? "bg-indigo-600 font-bold" : "text-gray-400"}`} onClick={() => setInterval("monthly")}>Monthly</button><button className={`px-3 py-1.5 text-xs rounded-md ${interval === "yearly" ? "bg-indigo-600 font-bold" : "text-gray-400"}`} onClick={() => setInterval("yearly")}>Yearly</button></div></div>
          <div className="grid lg:grid-cols-3 gap-4">{PLAN_ORDER.map((slug) => { const plan = PLAN_CONFIG[slug]; const active = currentPlan === slug; const price = plan.prices[interval]; return <article key={slug} className={`rounded-xl border p-5 flex flex-col ${active ? "border-indigo-500 bg-indigo-950/30" : "border-hairline bg-gray-900/60"}`}>
            <div className="flex items-center justify-between"><h4 className="text-lg font-bold">{plan.name}</h4>{active && <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-indigo-600">Current</span>}</div><p className="text-sm text-gray-400 mt-2 min-h-10">{plan.description}</p><div className="mt-4"><b className="text-3xl">{price === 0 ? "$0" : displayPrice(slug, interval)}</b><span className="text-gray-400 text-sm">{price === 0 ? " forever" : `/${interval === "monthly" ? "month" : "year"}`}</span></div>{interval === "yearly" && price > 0 && <p className="text-xs text-emerald-400 mt-1">{annualSavingLine(slug)}</p>}
            <ul className="text-sm text-gray-300 space-y-2 my-5 flex-1"><li>✓ 16:9 and 9:16 video</li><li>✓ Unlimited preview corrections</li><li>✓ Projects preserved if your plan changes</li><li>✓ {slug === "free" ? "2 Shorts + 1 long-video download weekly" : slug === "sceneflow" ? "15 final video downloads weekly" : "Unlimited final downloads, subject to fetched/upstream API service limits"}</li><li>✓ {slug === "free" ? "Sample visualisers, animated Subscribe CTA, 2 music tracks and 2 caption styles" : "All voices, captions and creative tools"}</li></ul>
            <button disabled={(!isOwnerAdmin && active) || busy === slug || (!isOwnerAdmin && !import.meta.env.DEV && slug !== "free")} onClick={() => isOwnerAdmin ? setAdminPlanPreview(slug) : void choosePlan(slug)} className={`w-full rounded-lg px-4 py-2.5 text-sm font-bold ${active ? "bg-gray-800 text-gray-300" : "bg-indigo-600 hover:bg-indigo-500"}`}>{isOwnerAdmin ? active ? "Previewing this plan" : `Preview as ${plan.name}` : active ? "Current plan" : busy === slug ? "Opening checkout…" : slug === "free" ? "Free membership" : import.meta.env.DEV ? `Choose ${plan.name} · PayPal Sandbox` : "Sandbox checkout only"}</button>
          </article>; })}</div>
          <p className="text-xs text-gray-500 mt-3">Paid plan prices are listed in USD. PayPal Sandbox checkout is available only in development while production billing remains disabled.</p>
        </section>

        {notice && <div className="rounded-lg border border-amber-600/50 bg-amber-950/30 text-amber-200 px-4 py-3 text-sm" role="status">{notice}</div>}

        <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-hairline bg-gray-900/60 p-4">
          <label className="flex gap-3 items-start text-sm"><input className="mt-1" type="checkbox" checked={marketingConsent} onChange={(e) => void saveEmailPreference(e.target.checked)} /><span><b>Optional tutorials and product news</b><span className="block text-gray-400">Transactional account, security and billing messages remain separate.</span></span></label>
          <div className="flex flex-wrap gap-2"><a className="opt-btn" href="/pricing">Full pricing page</a><a className="opt-btn" href="/features">Website features</a><a className="opt-btn" href="/manual">Manual</a><a className="opt-btn" href="/faq">FAQ</a><a className="opt-btn" href="/contact">Contact</a></div>
        </section>
      </div>
    </div>

    <ApiKeysModal isOpen={keysOpen} onClose={() => setKeysOpen(false)} />
    <PayPalSubscriptionDialog plan={paypalChoice?.plan || null} interval={paypalChoice?.interval || interval} onClose={() => setPaypalChoice(null)} />
  </div>;
}
