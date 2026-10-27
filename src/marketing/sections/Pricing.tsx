import { useState } from "react";
import { Section, SectionHead } from "../components/primitives";
import { PLAN_CONFIG, PLAN_ORDER, type BillingInterval } from "../../config/plans";
import { useLocalizedPlanPrices } from "../../lib/use-localized-prices";

/**
 * The plans, as three compact cards.
 *
 * Each card carries its name, its price, the one thing that plan is for
 * (capacity) and one button. The description, the saving line and the four
 * bullets that used to sit in every card are gone — they were most of the
 * section's height on a phone and said the same thing three times. The
 * detail lives on /pricing, linked directly below.
 */
export default function Pricing() {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  /* The same FastSpring-localized prices the /pricing page and the checkout
     use — the visitor's own currency, tax included — instead of the USD
     base numbers. Until FastSpring answers, displayPrice falls back to the
     base price labelled "USD". */
  const { displayPrice } = useLocalizedPlanPrices();

  const capacity: Record<string, string> = {
    free: "2 Shorts + 1 long video each week",
    sceneflow: "15 final downloads each week",
    sceneforge: "Unlimited final downloads",
  };

  return (
    <Section id="pricing" tone="white">
      <SectionHead
        id="pricing"
        eyebrow="Pricing"
        title="Free is real. Paid adds range and capacity."
        lead="Previews are free. Your allowance is spent on final downloads."
      />

      <div className="pub-toggle" role="group" aria-label="Billing interval">
        <button className={interval === "monthly" ? "is-on" : ""} onClick={() => setInterval("monthly")}>
          Monthly
        </button>
        <button className={interval === "yearly" ? "is-on" : ""} onClick={() => setInterval("yearly")}>
          Yearly
        </button>
      </div>

      <div className="pub-plans">
        {PLAN_ORDER.map((slug) => {
          const plan = PLAN_CONFIG[slug];
          const price = plan.prices[interval];
          return (
            <article className={`pub-plan mkt-plan-mini${slug === "sceneflow" ? " is-featured" : ""}`} key={slug}>
              <h3>{plan.name}</h3>
              <div className="pub-price">
                <b>{price === 0 ? "$0" : displayPrice(slug, interval)}</b>
                <span>{price === 0 ? "forever" : `/${interval === "monthly" ? "month" : "year"}`}</span>
              </div>
              <p className="mkt-small">{capacity[slug]}</p>
              <a
                className="mkt-btn mkt-btn-primary"
                href={slug === "free" ? "/register" : `/pricing?plan=${slug}&interval=${interval}`}
              >
                {slug === "free" ? "Start Free" : `Choose ${plan.name}`}
              </a>
            </article>
          );
        })}
      </div>

      <p className="mkt-small" style={{ textAlign: "center", marginTop: 14 }}>
        Every plan renders 16:9 and 9:16, and narrates with your own Speechify key.{" "}
        <a href="/pricing">Compare every feature →</a>
      </p>

      <p className="pub-legal-note">
        Prices include tax in your local currency, as FastSpring calculates them. By subscribing you agree to the{" "}
        <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>. Cancel any time — see the{" "}
        <a href="/refunds">Refund &amp; Cancellation Policy</a> and <a href="/cookies">Cookie Information</a>.
      </p>
    </Section>
  );
}
