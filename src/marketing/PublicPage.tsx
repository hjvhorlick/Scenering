import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval, type FeatureKey } from "../config/plans";
import { isFeatureTourPath, navigate, STUDIO_PATH } from "../lib/route";
import { useSession } from "../lib/session";
import { useLocalizedPlanPrices } from "../lib/use-localized-prices";
import PayPalSubscriptionDialog from "../components/PayPalSubscriptionDialog";
import { buildPricingTiers, TIER_FEATURES, type Tier } from "../config/pricing-tiers";
import { BrandMark } from "./components/primitives";
import HeaderLegalMenu from "./components/HeaderLegalMenu";
import Questions from "./sections/Questions";
import IdeaToVideo from "./sections/IdeaToVideo";
import ScenesSection from "./sections/ScenesSection";
import VisualResearch from "./sections/VisualResearch";
import VoiceSection from "./sections/VoiceSection";
import CaptionsSection from "./sections/CaptionsSection";
import VideoStudioSection from "./sections/VideoStudioSection";
import EffectsLibrary from "./sections/EffectsLibrary";
import BeforeAfter from "./sections/BeforeAfter";
import Control from "./sections/Control";
import Formats from "./sections/Formats";
import Devices from "./sections/Devices";
import Sources from "./sections/Sources";
import { LEGAL_CONTACT_PATH, LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE, LEGAL_ORGANISATION, LEGAL_OWNER, type LegalKind } from "./legal-content";
import SiteCornerMenu from "../shared/SiteCornerMenu";
import AdSlot from "../shared/AdSlot";
import SocialLinksRow from "../shared/SocialLinks";
import StoreNoticeBanner from "../shared/StoreNotice";
import { applyPageSeo } from "./seo";

const FAQPage = lazy(() => import("./FAQPage"));
const ManualPage = lazy(() => import("./ManualPage"));

const NAV = [["/", "Home"], ["/features", "Features"], ["/how-it-works", "How It Works"], ["/pricing", "Pricing"], ["/about", "About"], ["/manual", "Manual"], ["/faq", "FAQ"], ["/contact", "Contact"]] as const;
const FEATURE_LABELS: Partial<Record<FeatureKey, string>> = { scene_creation: "Scene creation", visual_research: "Visual research", basic_voice: "Voice options", voice_echo: "Voice echo & ambience", premium_captions: "All caption styles", full_video_studio: "Full Video Studio", filters: "Filters", text_templates: "Text templates", lower_thirds: "Lower thirds", advanced_cta: "Advanced CTA", stickers: "Expanded stickers", camera_movements: "Camera movements", background_music: "Background music", sound_effects: "Sound effects", sound_visualiser: "Sound visualisers", special_effects: "Special effects", horizontal_output: "16:9 output", vertical_output: "9:16 output", priority_processing: "Priority processing", bulk_workflow: "Bulk workflow" };

export function isStandalonePublicPath(path: string) { return ["/features", "/how-it-works", "/pricing", "/about", "/faq", "/manual", "/contact", "/privacy", "/terms", "/cookies", "/refunds", "/verify-email", "/reset-password", "/email-preferences", "/unsubscribe", "/welcome"].includes(path) || isFeatureTourPath(path); }

export default function PublicPage({ path }: { path: string }) {
  usePageMeta(path);
  let content: ReactNode;
  if (path === "/pricing") content = <PricingPage />;
  else if (path === "/features" || isFeatureTourPath(path)) content = <FeaturesPage />;
  else if (path === "/how-it-works") content = <HowPage />;
  else if (path === "/about") content = <AboutPage />;
  else if (path === "/faq") content = <Suspense fallback={<div className="pub-hero mkt-container" role="status">Loading the knowledge base…</div>}><FAQPage /></Suspense>;
  else if (path === "/manual") content = <Suspense fallback={<div className="pub-hero mkt-container" role="status">Loading the reference manual…</div>}><ManualPage /></Suspense>;
  else if (path === "/contact") content = <ContactPage />;
  else if (path === "/verify-email") content = <VerifyPage />;
  else if (path === "/reset-password") content = <ResetPage />;
  else if (path === "/email-preferences") content = <EmailPreferencesPage />;
  else if (path === "/unsubscribe") content = <UnsubscribePage />;
  else if (path === "/welcome") content = <WelcomePage />;
  else content = <LegalPage kind={path.slice(1) as "privacy" | "terms" | "cookies" | "refunds"} />;
  const showWebAd = !["/privacy", "/terms", "/cookies", "/refunds", "/verify-email", "/reset-password", "/email-preferences", "/unsubscribe"].includes(path);
  return <div className="mkt-root"><SiteCornerMenu /><PublicNav currentPath={path} /><StoreNoticeBanner /><main id="main" className="pub-main">{content}</main>{showWebAd && <AdSlot kind="web" className="mkt-container" style={{ maxWidth: 728, margin: "24px auto 0", padding: "0 16px 24px" }} testId="adsense-web" />}<PublicFooter /></div>;
}

function PublicNav({ currentPath }: { currentPath?: string }) { return <nav className="mkt-nav" aria-label="Main"><div className="mkt-container mkt-nav-inner"><a href="/" className="mkt-nav-logo"><BrandMark height={26} /></a><SocialLinksRow size={13} tone="light" className="mkt-nav-social" /><div className="pub-navlinks">{NAV.map(([href, label]) => <a key={href} href={href} className="mkt-nav-link">{label}</a>)}<HeaderLegalMenu currentPath={currentPath} /></div><span className="mkt-nav-spacer" /><span className="sc-corner-reserve" aria-hidden="true" /></div></nav>; }
function PublicFooter() {
  return (
    <footer className="mkt-footer">
      <div className="mkt-container pub-footer">
        <div>
          <BrandMark height={28} />
          <p>Turn ideas, scripts and audio into polished faceless videos while keeping meaningful creative control.</p>
          <SocialLinksRow size={24} style={{ margin: "12px 0" }} />
          <small>© 2026 Henry John Vincent Horlick · Horlick Group. Scenering. All rights reserved.</small>
        </div>
        <div>
          <h4>Product</h4>
          <a href="/features">Features</a>
          <a href="/how-it-works">How It Works</a>
          <a href="/pricing">Pricing</a>
        </div>
        <div>
          <h4>Help</h4>
          <a href="/manual">Manual</a>
          <a href="/faq">FAQ</a>
          <a href="/contact">Contact</a>
        </div>
        <div>
          <h4>Legal &amp; Policies</h4>
          <a href="/terms">Terms of Service</a>
          <a href="/privacy">Privacy Policy</a>
          <a href="/refunds">Refund &amp; Cancellation Policy</a>
          <a href="/cookies">Cookie Information</a>
        </div>
      </div>
      <div className="mkt-container">
        <div className="mkt-footer-legal-bar" aria-label="Legal documents">
          <span className="mkt-footer-legal-label">Legal documents</span>
          <div className="mkt-footer-legal-pills">
            <a href="/terms" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/terms"); } }}>Terms of Service</a>
            <a href="/privacy" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/privacy"); } }}>Privacy Policy</a>
            <a href="/refunds" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/refunds"); } }}>Refund &amp; Cancellation Policy</a>
            <a href="/cookies" onClick={(e) => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) { e.preventDefault(); navigate("/cookies"); } }}>Cookie Information</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
function PageHero({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: string }) { return <header className="pub-hero mkt-container"><span className="mkt-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{lead}</p></header>; }

/**
 * The full feature tour.
 *
 * These are the demonstrations that used to fill the front page — every
 * stage of the workflow drawn live from the demonstration project. They
 * made the front page read like a training course, so the front page now
 * sells (six cards, one per stage) and this page explains. Each card on the
 * front page, each "Jump to a section" shortcut in the corner menu, and
 * every friendly deep link (/scenes, /captions, …) lands here on the exact
 * area it names — isFeatureTourPath routes those paths to this page and
 * MarketingSite's scroll effect finds the section id once it is rendered.
 */
function FeaturesPage() { return <><PageHero eyebrow="Features" title="The whole studio, demonstrated." lead="Every demonstration below is the real workflow with a fictional project. Start with a question, or walk the tour in order." /><Questions /><IdeaToVideo /><ScenesSection /><VisualResearch /><VoiceSection /><CaptionsSection /><VideoStudioSection /><EffectsLibrary /><BeforeAfter /><Control /><Formats /><Devices /><Sources /><section className="mkt-container pub-callout"><div><h2>Seen enough?</h2><p>Free creates real finished videos, and premium tools stay visible so you can preview locked voices, captions and studio tools before deciding whether SceneFlow or SceneForge fits your workflow.</p></div><a className="mkt-btn mkt-btn-primary" href="/pricing">Compare plans</a></section></>; }
function HowPage() {
  const steps = [
    ["Paste or import", "A script or prepared audio file; nothing else is needed."],
    ["Scenes", "The text is split around meaning and narration, not a timer."],
    ["Visuals", "Each scene searches your sources; swap any picture in one click."],
    ["Narration", "Pick a narrator, preview it, then narrate every scene."],
    ["Captions", "Choose a style and let word timing come from the audio."],
    ["Video Studio", "Filters, motion, music and effects against the same timeline."],
    ["Export", "Preview freely, then render 16:9 or 9:16 on your machine."],
  ] as const;
  return (
    <>
      <PageHero eyebrow="How It Works" title="A clear workflow, not a mystery box." lead="Seven steps from source material to a finished file, correctable at every one." />
      <section className="mkt-container pub-steps">
        {steps.map(([title, note], i) => (
          <article key={title}>
            <b>{i + 1}</b>
            <div>
              <h2>{title}</h2>
              <p>{note}</p>
            </div>
          </article>
        ))}
      </section>
      <section className="mkt-container pub-callout">
        <div>
          <h2>Previews are free.</h2>
          <p>Plan usage applies when you confirm a final export, not while you adjust.</p>
        </div>
        <a className="mkt-btn mkt-btn-primary" href="/register">Start Free</a>
      </section>
    </>
  );
}

/** Pricing and checkout stay USD; paid checkout is Sandbox-only during review. */
function PricingPage() {
  const initialParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const initialInterval: BillingInterval = initialParams?.get("interval") === "yearly" ? "yearly" : "monthly";
  const [interval, setInterval] = useState<BillingInterval>(initialInterval);
  const [compare, setCompare] = useState(false);
  const { config, displayPrice, annualSavingLine } = useLocalizedPlanPrices();
  const [opening, setOpening] = useState("");
  const [paypalChoice, setPaypalChoice] = useState<{ plan: "sceneflow" | "sceneforge"; interval: BillingInterval } | null>(null);
  const { account } = useSession();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const plan = params.get("plan");
    if ((plan === "sceneflow" || plan === "sceneforge") && params.get("provider") === "paypal" && account) {
      setPaypalChoice({ plan, interval: params.get("interval") === "yearly" ? "yearly" : "monthly" });
      params.delete("provider"); params.delete("plan"); params.delete("interval");
      const query = params.toString();
      history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
  }, [account]);

  function subscribe(tier: Tier) {
    if (tier.id === "free") return;
    const plan = config?.previewTestPlan?.plan || (tier.id as "sceneflow" | "sceneforge");
    const checkoutInterval = config?.previewTestPlan?.interval || interval;
    if (!account) {
      localStorage.setItem("scenering_intended_checkout", JSON.stringify({ provider: "paypal", plan, interval: checkoutInterval }));
      navigate("/login");
      return;
    }
    setOpening(tier.id);
    setPaypalChoice({ plan, interval: checkoutInterval });
    setOpening("");
  }

  const previewTestPlan = config?.previewTestPlan || null;
  const allTiers = config?.tiers || buildPricingTiers(() => "");
  const displayedTiers = previewTestPlan
    ? allTiers.filter((tier) => tier.id === "free" || tier.id === previewTestPlan.plan)
    : allTiers;
  const displayedInterval = previewTestPlan?.interval || interval;
  const checkoutAvailable = import.meta.env.DEV || Boolean(config?.configured);

  return <><PageHero eyebrow="Pricing" title="Start free. Add capability when you need it." lead="Exactly three plans. Monthly and yearly are billing choices—not extra plans. Preview renders never consume final-export allowance. Subscription prices are listed in USD." />
    <section className="mkt-container">
      {previewTestPlan ? <p className="pub-legal-note">This branch Preview is set up for one PayPal Sandbox test plan: SceneFlow monthly. Production checkout remains disabled.</p> : <div className="pub-toggle" role="group" aria-label="Billing interval"><button className={interval === "monthly" ? "is-on" : ""} onClick={() => setInterval("monthly")}>Monthly</button><button className={interval === "yearly" ? "is-on" : ""} onClick={() => setInterval("yearly")}>Yearly</button></div>}
      <div className="pub-plans">{displayedTiers.map((tier) => <article className={`pub-plan${tier.id === "sceneflow" ? " is-featured" : ""}`} key={tier.id}>{tier.id === "sceneflow" && <span className="pub-ribbon">Regular creators</span>}<h2>{tier.name}</h2><p>{tier.description}</p>
        <div className="pub-price">{tier.id !== "free" ? <><b>{displayPrice(tier.id, displayedInterval)}</b><span>/{displayedInterval === "monthly" ? "month" : "year"}</span></> : <><b>Free</b><span>forever</span></>}</div>
        {displayedInterval === "yearly" && tier.id !== "free" && <p className="pub-saving">{annualSavingLine(tier.id)}</p>}
        <PlanHighlights slug={tier.id} features={tier.features} />
        {tier.id !== "free"
          ? checkoutAvailable
            ? <button className="mkt-btn mkt-btn-primary" disabled={opening === tier.id} onClick={() => subscribe(tier)}>{opening === tier.id ? "Opening PayPal Sandbox…" : previewTestPlan ? "Test SceneFlow monthly · PayPal Sandbox" : `Subscribe to ${tier.name} · PayPal Sandbox`}</button>
            : <button className="mkt-btn mkt-btn-primary" type="button" disabled title="Sandbox checkout is not configured for this environment">PayPal Sandbox checkout is not configured</button>
          : <a href="/register" className="mkt-btn mkt-btn-primary">Get Started Free</a>}
      </article>)}</div>
      <button className="pub-compare-btn" onClick={() => setCompare(!compare)} aria-expanded={compare}>{compare ? "Hide" : "Show"} complete feature comparison</button>
      {compare && <Comparison />}
      <p className="pub-legal-note">PayPal Sandbox transactions are for testing only; production billing remains disabled. By subscribing you agree to the <a href="/terms">Terms of Service</a>, <a href="/privacy">Privacy Policy</a> and <a href="/refunds">Refund &amp; Cancellation Policy</a>.</p>
    </section><PayPalSubscriptionDialog plan={paypalChoice?.plan || null} interval={paypalChoice?.interval || interval} onClose={() => setPaypalChoice(null)} /></>;
}
function PlanHighlights({ slug, features }: { slug: typeof PLAN_ORDER[number]; features?: string[] }) { const lines = features?.length ? features : TIER_FEATURES[slug]; return <ul className="pub-checks">{lines.map((x) => <li key={x}>✓ {x}</li>)}</ul>; }
function Comparison() { return <div className="pub-table-wrap"><table className="pub-table"><thead><tr><th>Capability</th>{PLAN_ORDER.map((s) => <th key={s}>{PLAN_CONFIG[s].name}</th>)}</tr></thead><tbody><tr><td>Final-download capacity</td><td data-label={PLAN_CONFIG.free.name}>2 Shorts + 1 long video/week</td><td data-label={PLAN_CONFIG.sceneflow.name}>15 videos/week</td><td data-label={PLAN_CONFIG.sceneforge.name}>Unlimited, subject to fetched/upstream API service limits</td></tr><tr><td>Creative catalog</td><td data-label={PLAN_CONFIG.free.name}>Sample visualisers, animated Subscribe CTA, 2 music tracks, 2 caption styles</td><td data-label={PLAN_CONFIG.sceneforge.name}>All creative features</td><td>All creative features</td></tr>{Object.entries(FEATURE_LABELS).map(([feature, label]) => <tr key={feature}><td>{label}</td>{PLAN_ORDER.map((slug) => <td key={slug} data-label={PLAN_CONFIG[slug].name}>{PLAN_CONFIG[slug].features[feature as FeatureKey] ? "✓ Included" : <span title={`Available in ${feature === "bulk_workflow" ? "SceneForge" : "SceneFlow"}`}>🔒 Unlock on paid</span>}</td>)}</tr>)}<tr><td>Image sources</td><td colSpan={3}>Configured Pexels and Pixabay, Wikimedia Commons, and bundled fallbacks</td></tr><tr><td>Devices at once</td><td data-label={PLAN_CONFIG.free.name}>1 device</td><td data-label={PLAN_CONFIG.sceneflow.name}>Up to 2 devices</td><td data-label={PLAN_CONFIG.sceneforge.name}>Up to 5 devices</td></tr><tr><td>Project storage</td><td data-label={PLAN_CONFIG.free.name}>Projects preserved</td><td data-label={PLAN_CONFIG.sceneflow.name}>Expanded capacity</td><td data-label={PLAN_CONFIG.sceneforge.name}>High-volume capacity</td></tr></tbody></table></div>; }

function AboutPage() { return <><PageHero eyebrow="About" title="Video creation with meaningful control." lead="Scenering was created for people who have ideas and stories to share but do not want filming—and do not want an opaque generator making every decision." /><section className="mkt-container pub-prose"><h2>What Scenering is</h2><p>A web application that turns scripts and prepared audio into scene-based faceless videos. It combines visual research, narration, captions, creative finishing and export in one guided workflow.</p><h2>Who it is for</h2><p>YouTube and Shorts creators, educators, churches and organizations, training teams, information channels, storytellers, travel and business creators, and anyone creating social content without appearing on camera.</p><h2>What we believe</h2><p>Automation should remove repetitive work without removing judgment. Scenering therefore keeps scenes, sources, narration, captions and finishing choices visible. It does not promise views, growth or income—the work and audience remain yours.</p></section></>; }
function ContactPage() { const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false); async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setStatus(""); const form = new FormData(e.currentTarget); const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }); const data = await response.json(); setStatus(data.message || data.error); if (response.ok) e.currentTarget.reset(); setBusy(false); } return <><PageHero eyebrow="Contact" title="How can we help?" lead="Send a product, technical, billing or account question. Messages are validated, rate-limited and stored for review." /><form className="mkt-container pub-form" onSubmit={submit}><div><label>Name<input name="name" required minLength={2} /></label><label>Email<input name="email" type="email" required /></label></div><div><label>Category<select name="category" required>{["General", "Technical", "Billing", "Account", "Feature Request", "Business", "Other"].map((c) => <option key={c}>{c}</option>)}</select></label><label>Subject<input name="subject" required minLength={3} /></label></div><label>Message<textarea name="message" rows={7} required minLength={10} /></label><label className="pub-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label><button className="mkt-btn mkt-btn-primary" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>{status && <p role="status">{status}</p>}</form></>; }
function LegalPage({ kind }: { kind: LegalKind }) { const document = LEGAL_DOCUMENTS[kind]; return <><PageHero eyebrow="Legal" title={document.title} lead={document.lead} /><section className="mkt-container pub-prose"><p className="pub-legal-date">Effective {LEGAL_EFFECTIVE_DATE} — {LEGAL_OWNER}, {LEGAL_ORGANISATION}</p><div className="pub-legal-summary"><h2>In short</h2><ul>{document.summary.map((item) => <li key={item}>{item}</li>)}</ul></div>{document.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}{section.table && <div className="pub-table-wrap"><table className="pub-table"><thead><tr>{section.table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row) => <tr key={row.join("|")}>{row.map((cell, index) => index === 0 ? <th scope="row" key={cell}>{cell}</th> : <td key={cell} data-label={section.table!.headers[index]}>{cell}</td>)}</tr>)}</tbody></table></div>}</section>)}<section><h2>Questions</h2><p>Use the <a href={LEGAL_CONTACT_PATH}>Contact page</a> for privacy, legal or account questions.</p></section><p className="pub-legal-note">See also <a href="/privacy">Privacy</a>, <a href="/terms">Terms</a>, <a href="/cookies">Cookie information</a> and <a href="/refunds">Refunds and cancellation</a>.</p></section></>; }
function WelcomePage() { return <><PageHero eyebrow="Welcome" title="Welcome to Scenering." lead="PayPal approval was returned. Your subscription activates only after Scenering verifies its status with PayPal; webhook confirmation may take a moment." /><div className="mkt-container pub-center"><a className="mkt-btn mkt-btn-primary" href="/app">Open the studio</a><p className="pub-legal-note">Your plan may take a minute to appear. PayPal Sandbox approval alone does not grant access. If it does not appear, contact us from the <a href="/contact">Contact page</a>.</p></div></>; }
const verifyRequests = new Map<string, Promise<string>>();
function VerifyPage() {
  const [status, setStatus] = useState("Verifying your email…");
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("token") || "";
    if (!token) {
      setStatus("This verification link is invalid or expired.");
      return;
    }
    let req = verifyRequests.get(token);
    if (!req) {
      req = fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
        .then(async (r) => {
          const d = await r.json().catch(() => ({}));
          return String(d.message || d.error || "Verification failed.");
        })
        .catch(() => "Verification failed.");
      verifyRequests.set(token, req);
    }
    req.then(setStatus);
  }, []);
  return <><PageHero eyebrow="Account" title="Email verification" lead={status} /><div className="mkt-container pub-center"><a href="/login" className="mkt-btn mkt-btn-primary">Continue to login</a></div></>;
}
function ResetPage() {
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);
  async function reset(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("password") !== fd.get("confirm")) return setStatus("The passwords do not match.");
    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: new URLSearchParams(location.search).get("token"), password: fd.get("password") }),
    });
    const data = await response.json().catch(() => ({}));
    setStatus(data.message || data.error);
    if (response.ok) setDone(true);
  }
  return <><PageHero eyebrow="Account" title="Choose a new password" lead="Reset links expire after one hour and can only be used once." /><form className="mkt-container pub-form pub-form-small" onSubmit={reset}><label>New password<input name="password" type="password" required minLength={10} /></label><label>Confirm password<input name="confirm" type="password" required minLength={10} /></label><button className="mkt-btn mkt-btn-primary">Update password</button>{status && <p role="status">{status}</p>}{done && <a href="/login" className="mkt-btn mkt-btn-primary" style={{ textAlign: "center" }}>Continue to login</a>}</form></>;
}
/* The two pages behind the links in every Scenering marketing email
   ({{preferences_url}} and {{unsubscribe_url}}). Both work signed-out via
   the tamper-proof token the email carries; neither exposes anything
   beyond the recipient's own marketing preference. Transactional mail —
   verification, password resets, security and billing notices — is never
   affected by these choices. */
function readEmailToken() { try { return new URLSearchParams(window.location.search).get("token") || ""; } catch { return ""; } }
async function emailPreferenceRequest(path: string, method: "GET" | "PUT" | "POST", token: string, body?: Record<string, unknown>) {
  const url = method === "GET" && token ? `${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(token)}` : path;
  const response = await fetch(url, {
    method,
    headers: method === "GET" ? undefined : { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify({ ...(body || {}), ...(token ? { token } : {}) }),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data } as { ok: boolean; data: any };
}
function EmailPreferencesPage() {
  const [token] = useState(readEmailToken);
  const [state, setState] = useState<{ status: "loading" | "error" | "ready"; consent: boolean; message: string }>({ status: "loading", consent: false, message: "" });
  useEffect(() => {
    let active = true;
    emailPreferenceRequest("/api/email-preferences", "GET", token).then(({ ok, data }) => {
      if (!active) return;
      if (!ok) return setState({ status: "error", consent: false, message: data.error || "This preferences link is invalid or has expired." });
      setState({ status: "ready", consent: Boolean(data.marketingConsent), message: "" });
    });
    return () => { active = false; };
  }, [token]);
  async function save(next: boolean) {
    setState((current) => ({ ...current, consent: next, message: "" }));
    const { ok, data } = await emailPreferenceRequest("/api/email-preferences", "PUT", token, { marketingConsent: next });
    if (!ok) setState((current) => ({ ...current, message: data.error || "Could not save your preference." }));
    else setState((current) => ({ ...current, consent: Boolean(data.marketingConsent), message: next ? "You will receive Scenering product news. Account and security messages are unaffected." : "You will not receive Scenering marketing email. Account and security messages are unaffected." }));
  }
  async function unsubscribeAll() {
    setState((current) => ({ ...current, message: "" }));
    const { ok, data } = await emailPreferenceRequest("/api/email/unsubscribe", "POST", token);
    setState((current) => ({ ...current, consent: false, message: ok ? (data.message || "You have been unsubscribed.") : (data.error || "Could not unsubscribe.") }));
  }
  return <><PageHero eyebrow="Email preferences" title="Choose what Scenering sends you" lead="Marketing email is strictly opt-in. Account, security and billing messages are sent regardless, because they protect your account." />
    <div className="mkt-container pub-form pub-form-small">
      {state.status === "loading" && <p role="status">Loading your preferences…</p>}
      {state.status === "error" && <><p role="alert">{state.message}</p><a href="/login" className="mkt-btn mkt-btn-primary">Sign in to manage preferences</a></>}
      {state.status === "ready" && <>
        <label className="pub-checks"><input type="checkbox" checked={state.consent} onChange={(event) => void save(event.target.checked)} /> Product news, tips and updates from Scenering</label>
        {state.message && <p role="status">{state.message}</p>}
        {state.consent && <button type="button" className="mkt-btn" onClick={() => void unsubscribeAll()}>Unsubscribe from all marketing email</button>}
      </>}
    </div></>;
}
function UnsubscribePage() {
  const [token] = useState(readEmailToken);
  const [state, setState] = useState<{ status: "idle" | "busy" | "done" | "error"; message: string }>({ status: token ? "idle" : "error", message: "" });
  async function unsubscribe() {
    setState({ status: "busy", message: "" });
    const { ok, data } = await emailPreferenceRequest("/api/email/unsubscribe", "POST", token);
    if (ok) setState({ status: "done", message: data.message || "You have been unsubscribed." });
    else setState({ status: "error", message: data.error || "This unsubscribe link is invalid or has expired." });
  }
  return <><PageHero eyebrow="Email preferences" title="Unsubscribe from Scenering marketing email" lead="One click stops all product news, tips and promotional messages." />
    <div className="mkt-container pub-center">
      {state.status === "idle" && <><p>You will stop receiving marketing email from Scenering. Account, security and billing messages about your own account are unaffected.</p><button type="button" className="mkt-btn mkt-btn-primary" onClick={() => void unsubscribe()}>Unsubscribe from marketing email</button></>}
      {state.status === "busy" && <p role="status">Unsubscribing…</p>}
      {state.status === "done" && <p role="status">{state.message}</p>}
      {state.status === "error" && <><p role="alert">{state.message || "This unsubscribe link is invalid or has expired."}</p><a href="/login" className="mkt-btn mkt-btn-primary">Sign in to manage preferences</a></>}
      <p className="pub-legal-note">Prefer to choose categories? <a href={token ? `/email-preferences?token=${encodeURIComponent(token)}` : "/email-preferences"}>Manage your email preferences</a></p>
    </div></>;
}

function usePageMeta(path: string) {
  useEffect(() => {
    applyPageSeo(path);
    if (!isFeatureTourPath(path) && typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [path]);
}
