import { useState } from "react";
import { Section, SectionHead } from "../components/primitives";
import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval } from "../../config/plans";

export default function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  return <Section id="pricing" tone="white">
    <SectionHead id="pricing" eyebrow="Pricing" title="Free is real. Paid adds creative range and capacity." lead="Preview and perfect your video as much as you need. Your plan allowance applies to meaningful final exports—not preview renders." />
    <div className="pub-toggle" role="group" aria-label="Billing interval"><button className={interval === "monthly" ? "is-on" : ""} onClick={() => setInterval("monthly")}>Monthly</button><button className={interval === "yearly" ? "is-on" : ""} onClick={() => setInterval("yearly")}>Yearly</button></div>
    <div className="pub-plans">
      {PLAN_ORDER.map((slug) => { const plan = PLAN_CONFIG[slug]; const price = plan.prices[interval]; const capacity = slug === "free" ? "2 Shorts + 1 long-video download each week" : slug === "sceneflow" ? "15 final video downloads each week" : "Unlimited final downloads, subject to fetched/upstream API service limits"; return <article className={`pub-plan${slug === "sceneflow" ? " is-featured" : ""}`} key={slug}>
        <h3>{plan.name}</h3><p>{plan.description}</p><div className="pub-price"><b>${price}</b><span>{price === 0 ? "forever" : `/${interval === "monthly" ? "month" : "year"}`}</span></div>
        {interval === "yearly" && price > 0 && <p className="pub-saving">${plan.annualMonthlyEquivalent}/month equivalent · save ${plan.annualSaving}/year</p>}
        <ul className="pub-checks"><li>✓ {capacity}</li><li>✓ {slug === "free" ? "Sample visualisers, animated Subscribe CTA, 2 music tracks and 2 caption styles" : "All creative features unlocked"}</li><li>✓ 16:9 and 9:16 output</li><li>✓ Projects remain yours</li><li>✓ Unlimited preview corrections</li></ul>
        <a className="mkt-btn mkt-btn-primary" href={slug === "free" ? "/register" : `/register?plan=${slug}&interval=${interval}`}>{slug === "free" ? "Start Free" : `Choose ${plan.name}`}</a>
      </article>; })}
    </div>
    <p style={{ textAlign: "center", marginTop: 20 }}><a href="/pricing">See the complete feature comparison →</a></p>
    <p className="mkt-small" style={{ textAlign: "center", marginTop: 10 }}>Paid checkout requires configured Lemon Squeezy credentials. Verified subscription status—not a checkout return page—controls paid access.</p>
  </Section>;
}
