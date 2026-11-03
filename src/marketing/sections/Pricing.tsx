import { Section, SectionHead } from "../components/primitives";
import { PLAN_CONFIG, PLAN_ORDER } from "../../config/plans";
import { TIER_FEATURES } from "../../config/pricing-tiers";
import { useLocalizedPlanPrices } from "../../lib/use-localized-prices";

/**
 * What the plans give you — and one button to the page where you get them.
 *
 * This section used to be a smaller copy of /pricing: the same Monthly/Yearly
 * toggle, the same three-card grid, the same oversized price block, the same
 * featured-plan badge, and a button under each plan reading "Choose
 * SceneForge". A visitor who reached the bottom of the front page had met the
 * pricing page twice, and the second copy's button did not do what it looked
 * like it did — it linked to /pricing, where the identical button had to be
 * pressed again before anything happened at all.
 *
 * So the front page answers one question, "what do I get", and leaves the
 * other to the page that can act on it. Prices, the choice of billing interval
 * and the subscribe buttons all live on /pricing, which is also where sign-in
 * happens, and each plan now has exactly one subscribe button, there. Nothing
 * on this page opens a checkout.
 */
export default function Pricing() {
  /* Subscription prices are fixed in USD; the same display helper is shared
     with /pricing and the in-app plan cards. Monthly is what is quoted here,
     because choosing yearly is part of choosing a plan and that decision
     belongs to the pricing page. */
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

      {/* Plain columns, not cards. Deliberately without the pricing page's
          toggle, price block and featured badge, so this reads as an overview
          rather than a second copy of the page the button below leads to. */}
      <div className="pub-grid">
        {PLAN_ORDER.map((slug) => {
          const plan = PLAN_CONFIG[slug];
          return (
            <div className="mkt-planrow" key={slug}>
              <h3>{plan.name}</h3>
              <p className="mkt-planrow-price">
                {plan.prices.monthly === 0 ? "Free forever" : `${displayPrice(slug, "monthly")} a month`}
              </p>
              <p className="mkt-small">{capacity[slug]}</p>
              <ul className="pub-checks">
                {TIER_FEATURES[slug].map((feature) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {/* One way forward. Free needs no subscription at all, so its entry
          point is registration; both paid plans are reached by the same
          button, and the pricing page is what asks which one. */}
      <div className="mkt-planrow-cta">
        <a className="mkt-btn mkt-btn-primary mkt-btn-lg" href="/pricing">See plans and subscribe</a>
        <a className="mkt-btn mkt-btn-lg" href="/register">Start Free</a>
      </div>

      <p className="mkt-small" style={{ textAlign: "center", marginTop: 14 }}>
        Every plan renders 16:9 and 9:16, with browser-local narration.
      </p>

      <p className="pub-legal-note">
        Subscription prices are shown in USD. PayPal Sandbox checkout is for testing only; production billing remains disabled. By subscribing you agree to the{" "}
        <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>. See the{" "}
        <a href="/refunds">Refund &amp; Cancellation Policy</a> and <a href="/cookies">Cookie Information</a>.
      </p>
    </Section>
  );
}
