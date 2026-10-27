import { useState } from "react";
import { Section, SectionHead } from "../components/primitives";
import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval } from "../../config/plans";
import { useLocalizedPlanPrices } from "../../lib/use-localized-prices";

export default function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  /* The same FastSpring-localized prices the /pricing page and the checkout
     use — the visitor's own currency, tax included — instead of the USD
     base numbers. Until FastSpring answers, displayPrice falls back to the
     base price labelled "USD". */
  const { displayPrice, annualSavingLine } = useLocalizedPlanPrices();
  return <Section id="pricing" tone="white">
    <SectionHead id="pricing" eyebrow="Pricing" title="Free is real. Paid adds creative range and capacity." lead="Previews are free. Your allowance is spent on final downloads." />
    <div className="pub-toggle" role="group" aria-label="Billing interval"><button className={interval === "monthly" ? "is-on" : ""} onClick={() => setInterval("monthly")}>Monthly</button><button className={interval === "yearly" ? "is-on" : ""} onClick={() => setInterval("yearly")}>Yearly</button></div>
    <div className="pub-plans">
      {PLAN_ORDER.map((slug) => { const plan = PLAN_CONFIG[slug]; const price = plan.prices[interval]; const capacity = slug === "free" ? "2 Shorts + 1 long-video download each week" : slug === "sceneflow" ? "15 final video downloads each week" : "Unlimited final downloads, subject to fetched/upstream API service limits"; return <article className={`pub-plan${slug === "sceneflow" ? " is-featured" : ""}`} key={slug}>
        <h3>{plan.name}</h3><p>{plan.description}</p><div className="pub-price"><b>{price === 0 ? "$0" : displayPrice(slug, interval)}</b><span>{price === 0 ? "forever" : `/${interval === "monthly" ? "month" : "year"}`}</span></div>
        {interval === "yearly" && price > 0 && <p className="pub-saving">{annualSavingLine(slug)}</p>}
        <ul className="pub-checks"><li>✓ {capacity}</li><li>✓ {slug === "free" ? "Sample styles, 2 music tracks, 2 caption styles" : "Every creative feature unlocked"}</li><li>✓ {plan.limits.maxConcurrentDevices === 1 ? "One device at a time" : `Up to ${plan.limits.maxConcurrentDevices} devices`}</li><li>✓ Narration with your own Speechify key</li></ul>
        <a className="mkt-btn mkt-btn-primary" href={slug === "free" ? "/register" : `/pricing?plan=${slug}&interval=${interval}`}>{slug === "free" ? "Start Free" : `Choose ${plan.name}`}</a>
      </article>; })}
    </div>
    <p style={{ textAlign: "center", marginTop: 20 }}><a href="/pricing">See the complete feature comparison →</a></p>
    <p className="pub-legal-note">Paid prices are shown in your local currency, with tax, exactly as FastSpring calculates them — the same total you will see at checkout. By subscribing you agree to the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>. Cancel any time; see the <a href="/refunds">Refund &amp; Cancellation Policy</a> and <a href="/cookies">Cookie Information</a>.</p>
  </Section>;
}
