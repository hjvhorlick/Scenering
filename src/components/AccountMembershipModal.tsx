import { useEffect, useRef, useState } from "react";
import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval, type PlanSlug } from "../config/plans";
import { getInterfacePlan, getSession, setAdminPlanPreview, useSession } from "../lib/session";
import Icon from "./icons/Icon";

type AccountPayload = {
  user: { email: string; displayName: string; emailVerified: boolean; role: "user" | "admin" };
  membership: { plan_id: PlanSlug; status: string; source?: string; complimentary_ends_at?: string | null; complimentary_period?: "month" | "year" | null };
  subscription?: { status: string; billing_interval: BillingInterval; current_period_end?: string; expires_at?: string; cancel_at_period_end?: boolean; customer_portal_url?: string; update_payment_url?: string; card_brand?: string; card_last_four?: string } | null;
  usage?: { finalExports: number; finalExportMinutes: number };
  remaining?: { finalExports: number | null; shortExports: number | null; longExports: number | null };
};

export default function AccountMembershipModal({ isOpen, onClose, focusPlans = false }: { isOpen: boolean; onClose: () => void; focusPlans?: boolean }) {
  const plansRef = useRef<HTMLElement | null>(null);
  const { account: sessionAccount } = useSession();
  const [account, setAccount] = useState<AccountPayload | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [adminData, setAdminData] = useState<any>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantPlan, setGrantPlan] = useState<"sceneflow" | "sceneforge">("sceneflow");
  const [grantPeriod, setGrantPeriod] = useState<"month" | "year">("month");
  const [codePlan, setCodePlan] = useState<"sceneflow" | "sceneforge">("sceneflow");
  const [codeValidity, setCodeValidity] = useState<7 | 30 | 90>(30);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; redeemUrl: string; expiresAt: string } | null>(null);
  const [redeemCode, setRedeemCode] = useState("");

  async function refreshAdmin() {
    const response = await fetch("/api/admin/overview");
    if (!response.ok) throw new Error("Admin overview could not be loaded.");
    setAdminData(await response.json());
  }

  useEffect(() => {
    if (!isOpen) return;
    setNotice("");
    Promise.all([
      fetch("/api/account").then((r) => r.ok ? r.json() : Promise.reject(new Error("Please sign in again."))),
      fetch("/api/email-preferences").then((r) => r.ok ? r.json() : null),
    ]).then(([next, preferences]) => {
      setAccount(next);
      setMarketingConsent(Boolean(preferences?.marketing_consent));
      if (next.user?.role === "admin") void refreshAdmin().catch((error) => setNotice(error.message));
    }).catch((error) => setNotice(error.message));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !focusPlans) return;
    const timer = window.setTimeout(() => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    return () => window.clearTimeout(timer);
  }, [isOpen, focusPlans]);

  if (!isOpen) return null;
  const isOwnerAdmin = account?.user.role === "admin" || account?.membership?.source === "owner_admin" || getSession()?.user.role === "admin";
  const authoritativePlan = account?.membership?.plan_id || getSession()?.membership?.plan_id || "free";
  const currentPlan = isOwnerAdmin ? getInterfacePlan(sessionAccount) : authoritativePlan;
  const isPreviewingPlan = isOwnerAdmin && currentPlan !== authoritativePlan;
  const enterStudio = () => { if (window.location.pathname === "/app" && window.location.search) history.replaceState({}, "", "/app"); onClose(); };

  async function choosePlan(plan: PlanSlug) {
    if (plan === "free") { setNotice("Free is always available. Paid subscriptions return to Free when verified paid access ends."); return; }
    setBusy(plan); setNotice("");
    try {
      const response = await fetch(`/api/billing/checkout/${plan}/${interval}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Checkout could not be opened.");
      if (data.url) window.location.href = data.url;
    } catch (error: any) { setNotice(error.message); }
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

  async function updateContactStatus(id: string, status: string) {
    const response = await fetch(`/api/admin/contacts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) return setNotice("Contact status could not be updated.");
    setAdminData((current: any) => ({ ...current, contacts: current.contacts.map((contact: any) => contact.id === id ? { ...contact, status } : contact) }));
  }

  async function saveEmailPreference(value: boolean) {
    setMarketingConsent(value);
    const response = await fetch("/api/email-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marketingConsent: value }) });
    const data = await response.json().catch(() => ({}));
    setNotice(response.ok ? "Email preference saved." : data.error || "Could not save email preference.");
  }

  return <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-start justify-center p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={(e) => { if (e.target === e.currentTarget) enterStudio(); }}>
    <div className="w-full max-w-6xl my-auto bg-gray-950 border border-hairline rounded-2xl shadow-2xl text-white overflow-hidden">
      <header className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-hairline bg-gray-900/80">
        <div><span className="text-[11px] uppercase tracking-[.18em] text-indigo-300 font-bold">Account & Membership</span><h2 id="account-title" className="text-2xl font-bold mt-1">{account?.user.displayName || "Your Scenering account"}</h2><p className="text-sm text-gray-400 mt-1">{account?.user.email || "Loading account…"}</p></div>
        <div className="flex items-center gap-2"><button className="rounded-lg bg-white text-blue-950 px-3 py-2 text-xs font-extrabold shadow-md hover:bg-blue-50" onClick={enterStudio}>Enter Studio</button><button className="opt-btn" onClick={enterStudio} aria-label="Close account and membership and enter Studio"><Icon glyph="✕" /></button></div>
      </header>

      <div className="p-5 sm:p-6 space-y-6">
        <section className="grid sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-indigo-700/60 bg-indigo-950/40 p-4"><div className="text-xs text-indigo-300">{isPreviewingPlan ? "Interface preview" : "Current membership"}</div><div className="text-xl font-bold mt-1">{PLAN_CONFIG[currentPlan].name}</div><div className="text-xs text-gray-400 mt-1">{account?.membership?.source === "complimentary" ? `Complimentary until ${new Date(account.membership.complimentary_ends_at!).toLocaleDateString()}` : account?.membership?.source === "owner_admin" ? "Owner administrator access" : account?.membership?.status || "active"}</div></div>
          <div className="rounded-xl border border-hairline bg-gray-900/70 p-4"><div className="text-xs text-gray-400">This week</div><div className="text-xl font-bold mt-1">{account?.usage?.finalExports ?? 0} final export{account?.usage?.finalExports === 1 ? "" : "s"}</div><div className="text-xs text-gray-400 mt-1">Preview renders are not counted</div></div>
          <div className="rounded-xl border border-hairline bg-gray-900/70 p-4">
            <div className="text-xs text-gray-400">Subscription</div>
            <div className="text-xl font-bold mt-1 capitalize">{(account?.subscription?.status || "No paid subscription").replace(/_/g, " ")}</div>
            {/* Everything a paying customer needs to stay in control of the
                charge: when it renews or ends, which card is on file, and a
                way out that does not involve emailing us. The links come from
                Lemon Squeezy itself, on the subscription webhook, so there is
                no second place to keep them up to date. */}
            {account?.subscription?.cancel_at_period_end && <div className="text-xs text-amber-300 mt-1">Cancelled — access continues until the paid period ends</div>}
            {(account?.subscription?.expires_at || account?.subscription?.current_period_end) && <div className="text-xs text-gray-400 mt-1">{account?.subscription?.cancel_at_period_end ? "Ends" : "Renews"} {new Date(account.subscription.expires_at || account.subscription.current_period_end!).toLocaleDateString()}</div>}
            {account?.subscription?.card_last_four && <div className="text-xs text-gray-500 mt-1 capitalize">{account.subscription.card_brand || "Card"} ending {account.subscription.card_last_four}</div>}
            {account?.subscription?.customer_portal_url || account?.subscription?.update_payment_url ? <div className="flex flex-wrap gap-2 mt-3">
              {account?.subscription?.customer_portal_url && <a className="opt-btn text-xs" href={account.subscription.customer_portal_url} target="_blank" rel="noopener noreferrer">Manage or cancel</a>}
              {account?.subscription?.update_payment_url && <a className="opt-btn text-xs" href={account.subscription.update_payment_url} target="_blank" rel="noopener noreferrer">Update payment card</a>}
            </div> : <div className="text-xs text-gray-400 mt-1">Verified Lemon Squeezy webhooks control paid access</div>}
          </div>
        </section>

        {isOwnerAdmin && <section className="rounded-xl border border-blue-500/60 bg-blue-950/25 p-4 sm:p-5 space-y-5" aria-label="Owner administration">
          <div><span className="text-[10px] uppercase tracking-[.16em] text-blue-300 font-bold">Owner administrator</span><h3 className="text-lg font-bold mt-1">Scenering administration</h3><p className="text-xs text-gray-400">Full SceneForge access plus customer, contact, email-consent and production configuration visibility. Secrets and password hashes are never displayed.</p></div>
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
          {adminData ? <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">{Object.entries(adminData.configuration || {}).map(([key, value]) => <div key={key} className="rounded-lg border border-white/10 bg-gray-950/60 p-3"><div className="text-[10px] text-gray-500 break-words">{key.replace(/([A-Z])/g, " $1")}</div><b className={value ? "text-emerald-300" : "text-amber-300"}>{value ? "Yes" : "No"}</b></div>)}</div>
            {/* Lemon Squeezy go-live checklist. Billing fails quietly when one
                variant id is missing — checkout still opens, the payment still
                succeeds, and the webhook then cannot tell which plan was
                bought. Naming each environment variable here makes that a
                thing you can see before a customer finds it. */}
            {adminData.billing && <div className="rounded-lg border border-white/10 bg-gray-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold">Lemon Squeezy billing</h4>
                <b className={adminData.billing.ready ? "text-emerald-300 text-xs" : "text-amber-300 text-xs"}>{adminData.billing.ready ? "Ready to take payments" : "Not ready — finish the items below"}</b>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3 text-xs">
                {[["Webhook signing secret", adminData.billing.webhookSecretSet, "LEMON_SQUEEZY_WEBHOOK_SECRET"], ["Store id", adminData.billing.storeIdSet, "LEMON_SQUEEZY_STORE_ID"], ["API key", adminData.billing.apiKeySet, "LEMON_SQUEEZY_API_KEY"], ["Public app URL", adminData.billing.publicAppUrlSet, "PUBLIC_APP_URL"]].map(([label, done, env]: any) => (
                  <div key={env} className="rounded-md border border-white/10 bg-gray-900/60 p-2"><div className="text-[10px] text-gray-500 break-all">{env}</div><b className={done ? "text-emerald-300" : "text-amber-300"}>{done ? "Set" : "Missing"}</b><span className="block text-[10px] text-gray-500">{label}</span></div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-2 mt-2 text-xs">
                {adminData.billing.plans.map((plan: any) => (
                  <div key={plan.plan} className="rounded-md border border-white/10 bg-gray-900/60 p-2">
                    <b>{plan.name}</b>
                    {plan.intervals.map((entry: any) => (
                      <div key={entry.interval} className="mt-1 capitalize">
                        <span className="text-gray-400">{entry.interval}:</span>{" "}
                        <span className={entry.checkoutUrlSet ? "text-emerald-300" : "text-amber-300"}>checkout {entry.checkoutUrlSet ? "set" : "missing"}</span>{" · "}
                        <span className={entry.variantIdSet ? "text-emerald-300" : "text-amber-300"}>variant id {entry.variantIdSet ? "set" : "missing"}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[11px] text-gray-400">
                <div>Webhook URL to register in Lemon Squeezy: <code className="text-gray-200 break-all">{adminData.billing.webhookUrl || `your site${adminData.billing.webhookPath}`}</code></div>
                <div className="mt-1">Events to tick: <span className="text-gray-300">{adminData.billing.requiredEvents.join(", ")}</span></div>
              </div>
              {adminData.webhookEvents?.length > 0 && <div className="mt-3">
                <h5 className="text-xs font-bold mb-1">Last webhooks received</h5>
                <div className="flex flex-wrap gap-1.5">{adminData.webhookEvents.map((event: any) => <span key={event.id} className={`rounded-md border px-2 py-1 text-[10px] ${event.status === "processed" ? "border-emerald-500/40 text-emerald-200" : event.status === "ignored" || event.status === "duplicate" ? "border-white/15 text-gray-400" : "border-amber-500/40 text-amber-200"}`}>{event.event_name} · {event.status}</span>)}</div>
              </div>}
            </div>}
            {adminData.complimentaryCodes?.length > 0 && <div><h4 className="text-sm font-bold mb-2">Access codes</h4><div className="flex flex-wrap gap-2">{adminData.complimentaryCodes.map((code: any) => <div key={code.id} className="rounded-lg border border-white/10 bg-gray-950/60 p-3 text-xs"><b>{code.code_prefix}</b><span className="block text-gray-400 capitalize">{code.plan_id} · {code.period} · {code.status}</span><span className="block text-gray-500">expires {new Date(code.expires_at).toLocaleDateString()}</span>{code.status === "active" && <button disabled={busy === `code-${code.id}`} type="button" onClick={() => void revokeAccessCode(code.id)} className="mt-2 rounded-md border border-white/15 px-2 py-1 hover:bg-gray-800">Revoke unused code</button>}</div>)}</div></div>}
            <form className="rounded-lg border border-blue-500/30 bg-gray-950/60 p-4" onSubmit={(event) => { event.preventDefault(); void grantComplimentary(null, grantPlan, grantPeriod, grantEmail); }}><h4 className="text-sm font-bold">Grant complimentary membership</h4><p className="text-[11px] text-gray-400 mt-1 mb-3">The customer must already have a verified Scenering account. No charge or Lemon Squeezy subscription is created.</p><div className="grid sm:grid-cols-[minmax(180px,1fr)_auto_auto_auto] gap-2"><input type="email" required value={grantEmail} onChange={(event) => setGrantEmail(event.target.value)} placeholder="Customer account email" className="min-w-0 rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs text-white" /><select value={grantPlan} onChange={(event) => setGrantPlan(event.target.value as "sceneflow" | "sceneforge")} className="rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs"><option value="sceneflow">SceneFlow</option><option value="sceneforge">SceneForge</option></select><select value={grantPeriod} onChange={(event) => setGrantPeriod(event.target.value as "month" | "year")} className="rounded-lg border border-white/15 bg-gray-900 px-3 py-2 text-xs"><option value="month">1 month</option><option value="year">1 year</option></select><button type="submit" disabled={busy === "grant-email"} className="rounded-lg bg-white text-blue-950 px-4 py-2 text-xs font-extrabold hover:bg-blue-50 disabled:opacity-60">{busy === "grant-email" ? "Granting…" : "Grant access"}</button></div></form>
            <div><h4 className="text-sm font-bold mb-2">Accounts, email consent and complimentary access</h4><div className="overflow-x-auto rounded-lg border border-white/10"><table className="w-full text-xs"><thead className="bg-gray-950"><tr><th className="text-left p-2">Customer</th><th className="text-left p-2">Role</th><th className="text-left p-2">Effective plan</th><th className="text-left p-2">Marketing</th><th className="text-left p-2">Complimentary membership</th></tr></thead><tbody>{adminData.users.map((user: any) => <tr key={user.id} className="border-t border-white/10 align-top"><td className="p-2"><b className="block">{user.displayName}</b><span className="text-gray-400">{user.email}</span></td><td className="p-2 capitalize">{user.role}</td><td className="p-2 capitalize"><b>{user.membership?.plan_id || "free"}</b>{user.membership?.source && <span className="block text-[10px] text-gray-500">{String(user.membership.source).replace(/_/g, " ")}</span>}{user.complimentaryGrant && <span className="block text-[10px] text-blue-300">until {new Date(user.complimentaryGrant.ends_at).toLocaleDateString()}</span>}</td><td className="p-2">{user.marketingConsent ? "Consented" : "No consent"}</td><td className="p-2 min-w-64">{user.role === "admin" ? <span className="text-gray-500">Owner access does not expire</span> : user.complimentaryGrant ? <div className="flex flex-wrap items-center gap-2"><span className="text-blue-200">{PLAN_CONFIG[user.complimentaryGrant.plan_id as PlanSlug].name} · {user.complimentaryGrant.period}</span><button disabled={busy === `revoke-${user.complimentaryGrant.id}`} onClick={() => void revokeComplimentary(user.complimentaryGrant.id)} className="rounded-md border border-white/15 px-2 py-1 hover:bg-gray-800">{busy === `revoke-${user.complimentaryGrant.id}` ? "Revoking…" : "Revoke"}</button></div> : <div className="flex flex-wrap gap-1"><button disabled={busy === `grant-${user.id}`} onClick={() => void grantComplimentary(user.id, "sceneflow", "month")} className="rounded-md bg-blue-700 px-2 py-1 hover:bg-blue-600">Flow · 1 month</button><button disabled={busy === `grant-${user.id}`} onClick={() => void grantComplimentary(user.id, "sceneflow", "year")} className="rounded-md bg-blue-700 px-2 py-1 hover:bg-blue-600">Flow · 1 year</button><button disabled={busy === `grant-${user.id}`} onClick={() => void grantComplimentary(user.id, "sceneforge", "month")} className="rounded-md bg-white text-blue-950 px-2 py-1 hover:bg-blue-50">Forge · 1 month</button><button disabled={busy === `grant-${user.id}`} onClick={() => void grantComplimentary(user.id, "sceneforge", "year")} className="rounded-md bg-white text-blue-950 px-2 py-1 hover:bg-blue-50">Forge · 1 year</button></div>}</td></tr>)}</tbody></table></div><p className="text-[11px] text-gray-500 mt-2">A complimentary grant changes access only; it does not create a charge or alter a verified Lemon Squeezy subscription. A new grant replaces any active complimentary grant for that account.</p></div>
            <div><h4 className="text-sm font-bold mb-2">Contact inbox</h4>{adminData.contacts.length ? <div className="space-y-2">{adminData.contacts.map((contact: any) => <article key={contact.id} className="rounded-lg border border-white/10 bg-gray-950/60 p-3"><div className="flex flex-wrap justify-between gap-2"><div><b className="text-sm">{contact.subject}</b><div className="text-[11px] text-gray-400">{contact.name} · {contact.email} · {contact.category}</div></div><select value={contact.status} onChange={(event) => void updateContactStatus(contact.id, event.target.value)} className="bg-gray-900 border border-white/15 rounded-md px-2 text-xs"><option>new</option><option>open</option><option>resolved</option><option>closed</option></select></div><p className="text-xs text-gray-300 mt-2 whitespace-pre-wrap">{contact.message}</p></article>)}</div> : <p className="text-xs text-gray-400">No contact messages have been received.</p>}</div>
          </> : <p className="text-sm text-gray-400">Loading secure administration data…</p>}
        </section>}

        {account && !isOwnerAdmin && <form className="rounded-xl border border-blue-700/50 bg-blue-950/20 p-4" onSubmit={(event) => { event.preventDefault(); void redeemAccessCode(); }}><h3 className="text-sm font-bold">Have a complimentary access code?</h3><p className="text-xs text-gray-400 mt-1 mb-3">Redeem a one-time code from Scenering to activate the included membership period.</p><div className="flex flex-col sm:flex-row gap-2"><input required value={redeemCode} onChange={(event) => setRedeemCode(event.target.value)} placeholder="SCN-…" className="flex-1 rounded-lg border border-white/15 bg-gray-950 px-3 py-2 text-sm uppercase" /><button disabled={busy === "redeem-code"} className="rounded-lg bg-white text-blue-950 px-4 py-2 text-xs font-extrabold">{busy === "redeem-code" ? "Redeeming…" : "Redeem code"}</button></div></form>}

        <section ref={plansRef}>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4"><div><span className="vip-flame"><span className="vip-flame-mark" aria-hidden="true">✦</span>VIP creative access</span><h3 className="text-lg font-bold mt-1">Choose the capacity that fits</h3><p className="text-sm text-gray-400">Preview VIP tools in your project, then choose SceneFlow or SceneForge to include them in final downloads.</p></div><div className="inline-flex rounded-lg bg-gray-900 border border-hairline p-1 self-start"><button className={`px-3 py-1.5 text-xs rounded-md ${interval === "monthly" ? "bg-indigo-600 font-bold" : "text-gray-400"}`} onClick={() => setInterval("monthly")}>Monthly</button><button className={`px-3 py-1.5 text-xs rounded-md ${interval === "yearly" ? "bg-indigo-600 font-bold" : "text-gray-400"}`} onClick={() => setInterval("yearly")}>Yearly</button></div></div>
          <div className="grid lg:grid-cols-3 gap-4">{PLAN_ORDER.map((slug) => { const plan = PLAN_CONFIG[slug]; const active = currentPlan === slug; const price = plan.prices[interval]; return <article key={slug} className={`rounded-xl border p-5 flex flex-col ${active ? "border-indigo-500 bg-indigo-950/30" : "border-hairline bg-gray-900/60"}`}>
            <div className="flex items-center justify-between"><h4 className="text-lg font-bold">{plan.name}</h4>{active && <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-indigo-600">Current</span>}</div><p className="text-sm text-gray-400 mt-2 min-h-10">{plan.description}</p><div className="mt-4"><b className="text-3xl">${price}</b><span className="text-gray-400 text-sm">{price === 0 ? " forever" : `/${interval === "monthly" ? "month" : "year"}`}</span></div>{interval === "yearly" && price > 0 && <p className="text-xs text-emerald-400 mt-1">${plan.annualMonthlyEquivalent}/month equivalent · save ${plan.annualSaving}/year</p>}
            <ul className="text-sm text-gray-300 space-y-2 my-5 flex-1"><li>✓ 16:9 and 9:16 video</li><li>✓ Unlimited preview corrections</li><li>✓ Projects preserved if your plan changes</li><li>✓ {slug === "free" ? "2 Shorts + 1 long-video download weekly" : slug === "sceneflow" ? "15 final video downloads weekly" : "Unlimited final downloads, subject to fetched/upstream API service limits"}</li><li>✓ {slug === "free" ? "Sample visualisers, animated Subscribe CTA, 2 music tracks and 2 caption styles" : "All voices, captions and creative tools"}</li></ul>
            <button disabled={(!isOwnerAdmin && active) || busy === slug} onClick={() => isOwnerAdmin ? setAdminPlanPreview(slug) : void choosePlan(slug)} className={`w-full rounded-lg px-4 py-2.5 text-sm font-bold ${active ? "bg-gray-800 text-gray-300" : "bg-indigo-600 hover:bg-indigo-500"}`}>{isOwnerAdmin ? active ? "Previewing this plan" : `Preview as ${plan.name}` : active ? "Current plan" : busy === slug ? "Opening checkout…" : slug === "free" ? "Free membership" : `Choose ${plan.name}`}</button>
          </article>; })}</div>
        </section>

        {notice && <div className="rounded-lg border border-amber-600/50 bg-amber-950/30 text-amber-200 px-4 py-3 text-sm" role="status">{notice}</div>}

        <section className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-xl border border-hairline bg-gray-900/60 p-4">
          <label className="flex gap-3 items-start text-sm"><input className="mt-1" type="checkbox" checked={marketingConsent} onChange={(e) => void saveEmailPreference(e.target.checked)} /><span><b>Optional tutorials and product news</b><span className="block text-gray-400">Transactional account, security and billing messages remain separate.</span></span></label>
          <div className="flex flex-wrap gap-2"><a className="opt-btn" href="/pricing">Full pricing page</a><a className="opt-btn" href="/features">Website features</a><a className="opt-btn" href="/manual">Manual</a><a className="opt-btn" href="/faq">FAQ</a><a className="opt-btn" href="/contact">Contact</a></div>
        </section>
      </div>
    </div>
  </div>;
}
