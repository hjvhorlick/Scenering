import { useState, type FormEvent } from "react";
import { registerAccount, resendVerification, signIn } from "../lib/session";
import { preloadStudio } from "./studio-loader";
import { redeemComplimentaryCode } from "../lib/entitlements";
import logo from "../assets/scenering-logo.png";
import IconSprite from "../components/icons/IconSprite";
import SiteCornerMenu from "../shared/SiteCornerMenu";
import SocialLinksRow from "../shared/SocialLinks";

type Mode = "login" | "register" | "forgot";

export default function SignIn() {
  const requested = new URLSearchParams(window.location.search).get("mode");
  const initialMode: Mode = window.location.pathname === "/register" || requested === "register" ? "register" : window.location.pathname === "/forgot-password" ? "forgot" : "login";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [displayName, setDisplayName] = useState(""); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false); const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null); setNeedsVerification(false); setBusy(true);
    try {
      if (mode === "forgot") {
        const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
        const data = await response.json(); setMessage(data.message || "Check your email for a reset link."); if (data.developmentResetUrl) window.location.href = data.developmentResetUrl; return;
      }
      if (mode === "register") {
        if (password !== confirm) throw new Error("The two passwords are different.");
        const params = new URLSearchParams(window.location.search);
        const accessCode = params.get("code");
        if (accessCode) localStorage.setItem("scenering_intended_access_code", accessCode);
        const intendedPlan = params.get("plan");
        if (intendedPlan === "sceneflow" || intendedPlan === "sceneforge") {
          localStorage.setItem("scenering_intended_checkout", JSON.stringify({ plan: intendedPlan, interval: params.get("interval") === "yearly" ? "yearly" : "monthly" }));
        }
        const result = await registerAccount(displayName, email, password, marketingConsent);
        setMessage(result.message + (result.developmentVerificationUrl ? " Development mode: use the verification link shown below." : ""));
        if (result.developmentVerificationUrl) window.location.href = result.developmentVerificationUrl;
        return;
      }
      await preloadStudio().catch(() => null); await signIn(email, password);
      const intendedCode = localStorage.getItem("scenering_intended_access_code");
      if (intendedCode) {
        await redeemComplimentaryCode(intendedCode);
        localStorage.removeItem("scenering_intended_access_code");
      }
      const intended = localStorage.getItem("scenering_intended_checkout");
      if (intended) {
        const choice = JSON.parse(intended) as { plan: string; interval: string };
        const response = await fetch(`/api/billing/checkout/${choice.plan}/${choice.interval}`);
        const checkout = await response.json();
        if (response.ok && checkout.url) { localStorage.removeItem("scenering_intended_checkout"); window.location.href = checkout.url; }
        else if (checkout.code === "BILLING_NOT_CONFIGURED") setMessage("Your account is ready. Paid checkout has not been configured yet, so you are continuing on Free.");
      }
    } catch (err: any) {
      setNeedsVerification(err?.code === "EMAIL_UNVERIFIED");
      setError(err.message || "Something went wrong.");
    }
    finally { setBusy(false); }
  }

  const switchMode = (next: Mode) => { setMode(next); setError(null); setMessage(null); setPassword(""); setConfirm(""); };
  return <div className="si-page"><IconSprite /><SiteCornerMenu />
    <header className="si-top"><img src={logo} alt="Scenering" height={30} style={{ height: 30, width: "auto" }} />
      <SocialLinksRow size={20} tone="light" style={{ marginLeft: "auto" }} />
      <span style={{ width: 92 }} aria-hidden="true" />
    </header>
    <main className="si-center"><form className="si-card" onSubmit={onSubmit}>
      <span className="si-pill">Free membership included</span>
      <div><h1>{mode === "login" ? "Welcome back." : mode === "register" ? "Create your Scenering account." : "Reset your password."}</h1>
        <p style={{ marginTop: 8 }}>{mode === "login" ? "Sign in to open your projects and studio." : mode === "register" ? "Start on Free. No payment details required." : "We’ll send a secure, one-hour reset link if the account exists."}</p></div>
      {mode === "register" && <div className="si-field"><label htmlFor="si-name">Display name</label><input id="si-name" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required minLength={2} /></div>}
      <div className="si-field"><label htmlFor="si-email">Email</label><input id="si-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      {mode !== "forgot" && <div className="si-field"><label htmlFor="si-pass">Password</label><input id="si-pass" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} placeholder={mode === "register" ? "At least 10 characters" : ""} /></div>}
      {mode === "register" && <><div className="si-field"><label htmlFor="si-confirm">Password again</label><input id="si-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
        <label className="si-note" style={{ flexDirection: "row", alignItems: "flex-start" }}><input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} /><span>Send me optional tutorials, training and product news. I can unsubscribe at any time. Account and security email is separate.</span></label></>}
      {error && <div className="si-error" role="alert">{error}</div>}
      {needsVerification && <button type="button" className="si-quiet" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try { const result = await resendVerification(email); setMessage(result.message || "Check your email for a new verification link."); }
        catch (err: any) { setError(err.message || "Could not resend the verification email."); }
        finally { setBusy(false); }
      }}>Resend verification email</button>}
      {message && <div className="si-note" role="status"><b>{message}</b></div>}
      <button className="si-btn" type="submit" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : mode === "register" ? "Create free account" : "Send reset link"}</button>
      <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
        {mode !== "login" && <button type="button" className="si-quiet" onClick={() => switchMode("login")}>Sign in</button>}
        {mode !== "register" && <button type="button" className="si-quiet" onClick={() => switchMode("register")}>Create account</button>}
        {mode === "login" && <button type="button" className="si-quiet" onClick={() => switchMode("forgot")}>Forgot password?</button>}
      </div>
      <div className="si-note"><b>Your account and projects are separate from billing.</b><span>Cancelling a paid subscription returns your membership to Free; it does not delete your account or projects. Preview renders do not use final-export allowance.</span></div>
    </form></main>
    <footer className="si-foot">Secure server-side password hashing · expiring sessions · Free membership on registration</footer>
  </div>;
}
