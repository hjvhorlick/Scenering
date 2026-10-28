import { PLAN_CONFIG, type PlanSlug } from "../config/plans";

/** Pure currency helpers for formatted monetary amounts. Scenering subscription
 * prices themselves remain fixed in USD; no provider conversion is used. */

/** The currency plan prices are stored in. */
export const PLAN_BASE_CURRENCY = "USD";

/**
 * The USD subscription price, explicitly labelled: `$19 USD`, so a visitor
 * in Johannesburg or Berlin never mistakes dollars for Rand or Euros.
 */
export function formatBasePrice(amount: number): string {
  return `$${amount} ${PLAN_BASE_CURRENCY}`;
}

/**
 * How many fraction digits a currency works in — 2 for USD/ZAR/EUR,
 * 0 for JPY, 3 for KWD. Read from Intl rather than a hand-kept table so every
 * currency supported by Intl is covered.
 */
export function currencyFractionDigits(currencyCode: string): number {
  try {
    const digits = new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode })
      .resolvedOptions().maximumFractionDigits;
    return typeof digits === "number" && digits >= 0 ? digits : 2;
  } catch {
    return 2;
  }
}

/**
 * Formats an amount given in a currency's lowest denomination as a display
 * string in that currency, e.g. (34862, "ZAR") → "R 348.62" in an en-ZA
 * browser.
 */
export function formatMinorAmount(minorAmount: number, currencyCode: string, locale?: string): string {
  const majorAmount = minorAmount / 10 ** currencyFractionDigits(currencyCode);
  return new Intl.NumberFormat(locale, { style: "currency", currency: currencyCode }).format(majorAmount);
}

export interface AnnualSaving {
  /** The yearly total spread over twelve months, formatted. */
  monthlyEquivalent: string;
  /** Twelve monthly payments minus the yearly total, formatted. */
  savingPerYear: string;
  /** Ready-to-render line, e.g. "$15.00/month equivalent · save $48.00/year". */
  line: string;
}

/**
 * The yearly saving line computed from localized raw totals, so it is in the
 * same currency — tax included — as the price next to it. Returns null when
 * the numbers do not describe a saving.
 */
export function annualSavingFromMinorTotals(
  monthlyMinorTotal: number,
  yearlyMinorTotal: number,
  currencyCode: string,
  locale?: string,
): AnnualSaving | null {
  if (!Number.isFinite(monthlyMinorTotal) || !Number.isFinite(yearlyMinorTotal)) return null;
  if (monthlyMinorTotal <= 0 || yearlyMinorTotal <= 0) return null;
  const savingMinor = monthlyMinorTotal * 12 - yearlyMinorTotal;
  if (savingMinor < 0) return null;
  const monthlyEquivalent = formatMinorAmount(yearlyMinorTotal / 12, currencyCode, locale);
  const savingPerYear = formatMinorAmount(savingMinor, currencyCode, locale);
  return {
    monthlyEquivalent,
    savingPerYear,
    line: `${monthlyEquivalent}/month equivalent · save ${savingPerYear}/year`,
  };
}

/**
 * The same line from the USD base prices in PLAN_CONFIG — the fallback
 * shown next to a fallback base price, so the two never mix
 * currencies on one card.
 */
export function annualSavingFromBasePrices(slug: PlanSlug): AnnualSaving {
  const plan = PLAN_CONFIG[slug];
  const monthlyEquivalent = `$${plan.annualMonthlyEquivalent}`;
  const savingPerYear = `$${plan.annualSaving}`;
  return {
    monthlyEquivalent,
    savingPerYear,
    line: `${monthlyEquivalent}/month equivalent · save ${savingPerYear}/year`,
  };
}
