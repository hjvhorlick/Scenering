import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval, type FeatureKey } from "../config/plans";
import { isFeatureTourPath, navigate, STUDIO_PATH } from "../lib/route";
import { BrandMark } from "./components/primitives";
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
import SocialLinksRow from "../shared/SocialLinks";

const FAQPage = lazy(() => import("./FAQPage"));
const ManualPage = lazy(() => import("./ManualPage"));

const NAV = [["/", "Home"], ["/features", "Features"], ["/how-it-works", "How It Works"], ["/pricing", "Pricing"], ["/about", "About"], ["/manual", "Manual"], ["/faq", "FAQ"], ["/contact", "Contact"]] as const;
const FEATURE_LABELS: Partial<Record<FeatureKey, string>> = { scene_creation: "Scene creation", visual_research: "Visual research", basic_voice: "Voice options", voice_echo: "Voice echo & ambience", premium_captions: "All caption styles", full_video_studio: "Full Video Studio", filters: "Filters", text_templates: "Text templates", lower_thirds: "Lower thirds", advanced_cta: "Advanced CTA", stickers: "Expanded stickers", camera_movements: "Camera movements", background_music: "Background music", sound_effects: "Sound effects", sound_visualiser: "Sound visualisers", special_effects: "Special effects", horizontal_output: "16:9 output", vertical_output: "9:16 output", priority_processing: "Priority processing", bulk_workflow: "Bulk workflow" };

export function isStandalonePublicPath(path: string) { return ["/features", "/how-it-works", "/pricing", "/about", "/faq", "/manual", "/contact", "/privacy", "/terms", "/cookies", "/verify-email", "/reset-password", "/email-preferences", "/unsubscribe"].includes(path) || isFeatureTourPath(path); }

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
  else content = <LegalPage kind={path.slice(1) as "privacy" | "terms" | "cookies"} />;
  return <div className="mkt-root"><SiteCornerMenu /><PublicNav /><main id="main" className="pub-main">{content}</main><PublicFooter /></div>;
}

function PublicNav() { return <nav className="mkt-nav" aria-label="Main"><div className="mkt-container mkt-nav-inner"><a href="/" className="mkt-nav-logo"><BrandMark height={26} /></a><div className="pub-navlinks">{NAV.map(([href, label]) => <a key={href} href={href} className="mkt-nav-link">{label}</a>)}</div><span className="mkt-nav-spacer" /><SocialLinksRow size={18} tone="light" className="mkt-nav-social" /><span style={{ width: 92 }} aria-hidden="true" /></div></nav>; }
function PublicFooter() { return <footer className="mkt-footer"><div className="mkt-container pub-footer"><div><BrandMark height={28} /><p>Turn ideas, scripts and audio into polished faceless videos while keeping meaningful creative control.</p><SocialLinksRow size={24} style={{ margin: "12px 0" }} /><small>© 2026 Henry John Vincent Horlick. Scenering. All rights reserved.</small></div><div><h4>Product</h4><a href="/features">Features</a><a href="/how-it-works">How It Works</a><a href="/pricing">Pricing</a></div><div><h4>Help</h4><a href="/manual">Manual</a><a href="/faq">FAQ</a><a href="/contact">Contact</a></div><div><h4>Legal</h4><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/cookies">Cookies</a></div></div></footer>; }
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
function FeaturesPage() { return <><PageHero eyebrow="Features" title="The whole studio, demonstrated." lead="Everything below is the real workflow, drawn from a demonstration project — not a storyboard of promises. Start with the question on your mind, or walk the tour in order." /><Questions /><IdeaToVideo /><ScenesSection /><VisualResearch /><VoiceSection /><CaptionsSection /><VideoStudioSection /><EffectsLibrary /><BeforeAfter /><Control /><Formats /><Devices /><Sources /><section className="mkt-container pub-callout"><div><h2>Seen enough?</h2><p>Free creates real finished videos, and premium tools stay visible so you can preview locked voices, captions and studio tools before deciding whether SceneFlow or SceneForge fits your workflow.</p></div><a className="mkt-btn mkt-btn-primary" href="/pricing">Compare plans</a></section></>; }
function HowPage() { const steps = ["Understand the supplied script or audio", "Build logical scenes around meaning and narration", "Research relevant visuals from configured sources", "Add and preview narration", "Style readable captions", "Finish with creative controls in Video Studio", "Preview, correct and create the final export"]; return <><PageHero eyebrow="How It Works" title="A clear workflow, not a mystery box." lead="Follow the video from source material to export, with room to make corrections at every stage." /><section className="mkt-container pub-steps">{steps.map((step, i) => <article key={step}><b>{i + 1}</b><div><h2>{step}</h2><p>{i === 2 ? "Scenering primarily uses fetched visual sources. Pexels and Pixabay work when configured; Wikimedia Commons and the bundled nature library provide fallbacks." : "Review the result, make changes and continue when it feels right."}</p></div></article>)}</section><section className="mkt-container pub-callout"><div><h2>Preview without using final-export allowance.</h2><p>Perfect scenes, visuals, voices, captions and effects first. Plan usage applies when you confirm a final export.</p></div><a className="mkt-btn mkt-btn-primary" href="/register">Start Free</a></section></>; }

function PricingPage() { const [interval, setInterval] = useState<BillingInterval>("monthly"); const [compare, setCompare] = useState(false); return <><PageHero eyebrow="Pricing" title="Start free. Add capability when you need it." lead="Exactly three plans. Monthly and yearly are billing choices—not extra plans. Preview renders never consume final-export allowance." /><section className="mkt-container"><div className="pub-toggle" role="group" aria-label="Billing interval"><button className={interval === "monthly" ? "is-on" : ""} onClick={() => setInterval("monthly")}>Monthly</button><button className={interval === "yearly" ? "is-on" : ""} onClick={() => setInterval("yearly")}>Yearly · save up to $96</button></div><div className="pub-plans">{PLAN_ORDER.map((slug) => { const plan = PLAN_CONFIG[slug], price = plan.prices[interval]; return <article className={`pub-plan${slug === "sceneflow" ? " is-featured" : ""}`} key={slug}>{slug === "sceneflow" && <span className="pub-ribbon">Regular creators</span>}<h2>{plan.name}</h2><p>{plan.description}</p><div className="pub-price"><b>${price}</b><span>{price === 0 ? "forever" : `/${interval === "monthly" ? "month" : "year"}`}</span></div>{interval === "yearly" && price > 0 && <p className="pub-saving">${plan.annualMonthlyEquivalent}/month equivalent · save ${plan.annualSaving}/year</p>}<PlanHighlights slug={slug} /><a href={slug === "free" ? "/register" : `/register?plan=${slug}&interval=${interval}`} className="mkt-btn mkt-btn-primary">{slug === "free" ? "Get Started Free" : `Choose ${plan.name}`}</a></article>; })}</div><button className="pub-compare-btn" onClick={() => setCompare(!compare)} aria-expanded={compare}>{compare ? "Hide" : "Show"} complete feature comparison</button>{compare && <Comparison />}</section></>; }
function PlanHighlights({ slug }: { slug: typeof PLAN_ORDER[number] }) { const lines = slug === "free" ? ["2 × 1-minute Shorts each week", "1 × 5-minute long video each week", "2 voice presets and 2 caption styles", "Sample audio visualisers and 2 music tracks", "Animated Subscribe call to action"] : slug === "sceneflow" ? ["15 final video downloads each week", "All available voices and caption styles", "All Video Studio creative tools", "Expanded visual research", "Unlimited preview corrections"] : ["Unlimited final downloads, subject to fetched/upstream API service limits", "All available voices and caption styles", "All Video Studio creative tools", "High-capacity visual research", "Unlimited preview corrections"]; return <ul className="pub-checks">{lines.map((x) => <li key={x}>✓ {x}</li>)}</ul>; }
function Comparison() { return <div className="pub-table-wrap"><table className="pub-table"><thead><tr><th>Capability</th>{PLAN_ORDER.map((s) => <th key={s}>{PLAN_CONFIG[s].name}</th>)}</tr></thead><tbody><tr><td>Final-download capacity</td><td>2 Shorts + 1 long video/week</td><td>15 videos/week</td><td>Unlimited, subject to fetched/upstream API service limits</td></tr><tr><td>Creative catalog</td><td>Sample visualisers, animated Subscribe CTA, 2 music tracks, 2 caption styles</td><td>All creative features</td><td>All creative features</td></tr>{Object.entries(FEATURE_LABELS).map(([feature, label]) => <tr key={feature}><td>{label}</td>{PLAN_ORDER.map((slug) => <td key={slug}>{PLAN_CONFIG[slug].features[feature as FeatureKey] ? "✓ Included" : <span title={`Available in ${feature === "bulk_workflow" ? "SceneForge" : "SceneFlow"}`}>🔒 Unlock on paid</span>}</td>)}</tr>)}<tr><td>Image sources</td><td colSpan={3}>Configured Pexels and Pixabay, Wikimedia Commons, and bundled fallbacks</td></tr><tr><td>Project storage</td><td>Projects preserved</td><td>Expanded capacity</td><td>High-volume capacity</td></tr></tbody></table></div>; }

function AboutPage() { return <><PageHero eyebrow="About" title="Video creation with meaningful control." lead="Scenering was created for people who have ideas and stories to share but do not want filming—and do not want an opaque generator making every decision." /><section className="mkt-container pub-prose"><h2>What Scenering is</h2><p>A web application that turns scripts and prepared audio into scene-based faceless videos. It combines visual research, narration, captions, creative finishing and export in one guided workflow.</p><h2>Who it is for</h2><p>YouTube and Shorts creators, educators, churches and organizations, training teams, information channels, storytellers, travel and business creators, and anyone creating social content without appearing on camera.</p><h2>What we believe</h2><p>Automation should remove repetitive work without removing judgment. Scenering therefore keeps scenes, sources, narration, captions and finishing choices visible. It does not promise views, growth or income—the work and audience remain yours.</p></section></>; }
function ContactPage() { const [status, setStatus] = useState(""); const [busy, setBusy] = useState(false); async function submit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setStatus(""); const form = new FormData(e.currentTarget); const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) }); const data = await response.json(); setStatus(data.message || data.error); if (response.ok) e.currentTarget.reset(); setBusy(false); } return <><PageHero eyebrow="Contact" title="How can we help?" lead="Send a product, technical, billing or account question. Messages are validated, rate-limited and stored for review." /><form className="mkt-container pub-form" onSubmit={submit}><div><label>Name<input name="name" required minLength={2} /></label><label>Email<input name="email" type="email" required /></label></div><div><label>Category<select name="category" required>{["General", "Technical", "Billing", "Account", "Feature Request", "Business", "Other"].map((c) => <option key={c}>{c}</option>)}</select></label><label>Subject<input name="subject" required minLength={3} /></label></div><label>Message<textarea name="message" rows={7} required minLength={10} /></label><label className="pub-honeypot" aria-hidden="true">Website<input name="website" tabIndex={-1} autoComplete="off" /></label><button className="mkt-btn mkt-btn-primary" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>{status && <p role="status">{status}</p>}</form></>; }
function LegalPage({ kind }: { kind: LegalKind }) { const document = LEGAL_DOCUMENTS[kind]; return <><PageHero eyebrow="Legal" title={document.title} lead={document.lead} /><section className="mkt-container pub-prose"><p className="pub-legal-date">Effective {LEGAL_EFFECTIVE_DATE} — {LEGAL_OWNER}, {LEGAL_ORGANISATION}</p><div className="pub-legal-summary"><h2>In short</h2><ul>{document.summary.map((item) => <li key={item}>{item}</li>)}</ul></div>{document.sections.map((section) => <section key={section.heading}><h2>{section.heading}</h2>{section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.bullets && <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>}{section.table && <div className="pub-table-wrap"><table className="pub-table"><thead><tr>{section.table.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{section.table.rows.map((row) => <tr key={row.join("|")}>{row.map((cell, index) => index === 0 ? <th scope="row" key={cell}>{cell}</th> : <td key={cell}>{cell}</td>)}</tr>)}</tbody></table></div>}</section>)}<section><h2>Questions</h2><p>Use the <a href={LEGAL_CONTACT_PATH}>Contact page</a> for privacy, legal or account questions.</p></section><p className="pub-legal-note">See also <a href="/privacy">Privacy</a>, <a href="/terms">Terms</a> and <a href="/cookies">Cookie information</a>.</p></section></>; }
function VerifyPage() { const [status, setStatus] = useState("Verifying your email…"); useEffect(() => { const token = new URLSearchParams(location.search).get("token"); fetch("/api/auth/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }).then(async (r) => { const d = await r.json(); setStatus(d.message || d.error); }); }, []); return <><PageHero eyebrow="Account" title="Email verification" lead={status} /><div className="mkt-container pub-center"><a href="/login" className="mkt-btn mkt-btn-primary">Continue to login</a></div></>; }
function ResetPage() { const [status, setStatus] = useState(""); async function reset(e: FormEvent<HTMLFormElement>) { e.preventDefault(); const fd = new FormData(e.currentTarget); if (fd.get("password") !== fd.get("confirm")) return setStatus("The passwords do not match."); const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: new URLSearchParams(location.search).get("token"), password: fd.get("password") }) }); const data = await response.json(); setStatus(data.message || data.error); } return <><PageHero eyebrow="Account" title="Choose a new password" lead="Reset links expire after one hour and can only be used once." /><form className="mkt-container pub-form pub-form-small" onSubmit={reset}><label>New password<input name="password" type="password" required minLength={10} /></label><label>Confirm password<input name="confirm" type="password" required minLength={10} /></label><button className="mkt-btn mkt-btn-primary">Update password</button>{status && <p role="status">{status}</p>}</form></>; }
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
function usePageMeta(path: string) { useEffect(() => { const label = NAV.find(([href]) => href === path)?.[1] || (isFeatureTourPath(path) ? "Features" : path === "/privacy" ? "Privacy" : path === "/terms" ? "Terms" : "Scenering"); document.title = `${label} — Scenering`; let meta = document.querySelector('meta[name="description"]'); if (meta) meta.setAttribute("content", `Scenering ${label}: turn scripts and audio into scene-based faceless videos with meaningful creative control.`); let canonical = document.querySelector('link[rel="canonical"]'); canonical?.setAttribute("href", path); }, [path]); }

