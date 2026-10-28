import { readFileSync } from "node:fs";
import { createHarness } from "./harness";
import { PLAN_CONFIG } from "../src/config/plans";
import {
  PLAN_BASE_CURRENCY,
  annualSavingFromBasePrices,
  annualSavingFromMinorTotals,
  currencyFractionDigits,
  formatBasePrice,
  formatMinorAmount,
} from "../src/lib/localized-prices";

const h = createHarness();
const read = (path: string) => readFileSync(path, "utf8");

/* Subscription prices are fixed in USD; currency helpers remain available for
   other displays but subscription checkout does not localize or convert them. */
h.eq(PLAN_BASE_CURRENCY, "USD", "the plan base currency is USD");
h.eq(formatBasePrice(PLAN_CONFIG.sceneflow.prices.monthly), "$19 USD", "a fallback base price is labelled USD");
h.eq(formatBasePrice(PLAN_CONFIG.sceneforge.prices.yearly), "$372 USD", "yearly fallback base price is labelled USD");

h.eq(currencyFractionDigits("USD"), 2, "USD works in cents");
h.eq(currencyFractionDigits("ZAR"), 2, "ZAR works in cents");
h.eq(currencyFractionDigits("JPY"), 0, "JPY has no minor unit");

h.eq(formatMinorAmount(1900, "USD", "en-US"), "$19.00", "raw USD cents format as dollars");
const rand = formatMinorAmount(34862, "ZAR", "en-ZA");
h.ok(rand.includes("R") && rand.includes("348"), `raw ZAR cents format as Rand (got ${rand})`);
h.ok(formatMinorAmount(1900, "JPY", "en-US").includes("1,900"), "raw JPY is not divided by 100");

const usdSaving = annualSavingFromMinorTotals(1900, 18000, "USD", "en-US");
h.eq(usdSaving?.monthlyEquivalent, "$15.00", "localized monthly equivalent comes from the yearly total");
h.eq(usdSaving?.savingPerYear, "$48.00", "localized saving comes from both raw totals");
h.eq(usdSaving?.line, "$15.00/month equivalent · save $48.00/year", "the saving line is in the displayed currency");
const zarSaving = annualSavingFromMinorTotals(34862, 330183, "ZAR", "en-ZA");
h.ok(Boolean(zarSaving && zarSaving.line.includes("R") && !zarSaving.line.includes("$")), "a Rand saving line never mixes in a Dollar sign");
h.eq(annualSavingFromMinorTotals(0, 18000, "USD"), null, "no saving line is invented from a zero monthly total");
h.eq(annualSavingFromBasePrices("sceneflow").line, "$15/month equivalent · save $48/year", "the fallback saving line matches the USD base prices");
h.eq(annualSavingFromBasePrices("sceneforge").line, "$31/month equivalent · save $96/year", "SceneForge fallback saving line matches the USD base prices");

/* Every surface that shows a price reads it from the one hook, so the
   home page can never drift back to printing USD base numbers while
   /pricing and the checkout show the visitor's own currency. */
const PRICE_SURFACES = [
  "src/marketing/sections/Pricing.tsx",
  "src/marketing/PublicPage.tsx",
  "src/components/AccountMembershipModal.tsx",
  "src/components/SetupStudio.tsx",
];
for (const surface of PRICE_SURFACES) {
  const source = read(surface);
  h.ok(source.includes("useLocalizedPlanPrices"), `${surface} gets its prices from useLocalizedPlanPrices`);
  h.ok(!source.includes(">$" + "{price}<") && !source.includes('"$' + '{price}"') && !/>\$\{price\}</.test(source), `${surface} does not print a raw $ price`);
  h.ok(!source.includes("$" + "{plan.annualMonthlyEquivalent}") && !source.includes("$" + "{plan.annualSaving}"), `${surface} does not print a raw $ saving`);
}

const hook = read("src/lib/use-localized-prices.ts");
h.ok(hook.includes("/api/billing/public-config"), "the hook loads the public PayPal Sandbox plan configuration");
h.ok(hook.includes("/api/billing/public-config"), "the hook loads the public billing config");
h.ok(hook.includes("formatBasePrice"), "the hook's fallback is the labelled USD base price");

/* Static copy states the fixed USD subscription prices and Sandbox limitation. */
const legal = read("src/marketing/legal-content.ts");
h.ok(legal.includes("US Dollars (USD)") && legal.includes("$19/month") && legal.includes("$39/month"), "the Terms label their subscription prices as USD");
h.ok(legal.includes("production billing is disabled"), "the Terms disclose that checkout is Sandbox-only");

h.done("localized-prices");
