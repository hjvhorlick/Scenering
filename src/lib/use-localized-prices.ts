import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { Paddle } from "@paddle/paddle-js";
import { loadPaddle, type PaddlePublicConfig } from "./paddle";
import {
  annualSavingFromBasePrices,
  annualSavingFromMinorTotals,
  formatBasePrice,
} from "./localized-prices";
import { PLAN_CONFIG, type BillingInterval, type PlanSlug } from "../config/plans";

/**
 * One localized price for every surface.
 *
 * The /pricing page has always done this properly — ask
 * Paddle.PricePreview() and show the visitor's own currency, tax
 * included, exactly as Paddle formats it — while the home-page
 * pricing section and the in-app plan cards printed the USD base
 * numbers from PLAN_CONFIG. A visitor in South Africa therefore saw
 * "$19" at home and a Rand total at /pricing and at checkout.
 *
 * This hook is now the single way any surface gets a price. It loads
 * the public billing config once per page (the snapshot promise below
 * is shared, so the Setup plan cards and the membership window in the
 * studio do not each ask Paddle again), previews every priced tier at
 * both intervals in one call for the visitor's country, and hands
 * each component:
 *
 *   - displayPrice(slug, interval): the localized formatted total
 *     when Paddle has answered, otherwise the USD base price labelled
 *     "USD" (see localized-prices.ts), and
 *   - annualSavingLine(slug): the per-month equivalent and saving in
 *     that same currency, computed from Paddle's raw totals.
 *
 * The Paddle catalogue prices themselves stay in USD; Paddle's
 * automatic currency conversion is what turns them into the
 * visitor's currency, both here and in the checkout the visitor pays
 * in. Nothing in this file converts currency by hand.
 */

interface PaddlePriceSnapshot {
  config: PaddlePublicConfig;
  paddle: Paddle | null;
  /** Paddle's own display strings (`formattedTotals.total`), by price id. */
  formattedByPriceId: Record<string, string>;
  /** Raw totals in the currency's lowest denomination, by price id. */
  minorTotalsByPriceId: Record<string, number>;
  /** The currency Paddle previewed in, e.g. "ZAR" for South Africa. */
  currencyCode: string | null;
  pricesError: string | null;
}

let snapshotPromise: Promise<PaddlePriceSnapshot> | null = null;

function loadPaddlePriceSnapshot(): Promise<PaddlePriceSnapshot> {
  snapshotPromise ??= (async (): Promise<PaddlePriceSnapshot> => {
    let ok = false;
    let data: PaddlePublicConfig & { error?: string; detail?: string };
    try {
      const response = await fetch("/api/billing/public-config");
      ok = response.ok;
      data = await response.json();
    } catch {
      throw new Error("Pricing could not be loaded. Check your connection and refresh.");
    }
    if (!ok) {
      throw new Error(`${data?.error || "Pricing could not be configured."}${data?.detail ? ` (${data.detail})` : ""}`);
    }
    const config: PaddlePublicConfig = data;

    // Throws (rather than defaulting) on a missing or mismatched client
    // token — that becomes the config error the pricing page reports.
    const paddle = await loadPaddle(config);

    const snapshot: PaddlePriceSnapshot = {
      config,
      paddle,
      formattedByPriceId: {},
      minorTotalsByPriceId: {},
      currencyCode: null,
      pricesError: null,
    };
    if (!paddle) return snapshot;

    /* One preview call fetches every priced tier at both intervals —
       PricePreview accepts up to 100 items, so the billing toggles
       read from the same response instead of refetching. */
    const items = config.tiers
      .flatMap((tier) => [tier.priceId.month, tier.priceId.year])
      .filter(Boolean)
      .map((priceId) => ({ priceId, quantity: 1 }));
    if (!items.length) return snapshot;

    try {
      const response = await paddle.PricePreview({
        items,
        ...(config.country ? { address: { countryCode: config.country } } : {}),
      });
      for (const item of response.data.details.lineItems) {
        snapshot.formattedByPriceId[item.price.id] = item.formattedTotals.total;
        const minorTotal = Number(item.totals.total);
        if (Number.isFinite(minorTotal)) snapshot.minorTotalsByPriceId[item.price.id] = minorTotal;
      }
      snapshot.currencyCode = response.data.currencyCode || null;
    } catch (error) {
      console.error("[paddle] price preview failed", error);
      snapshot.pricesError = "Prices for your country could not be loaded. Refresh to try again.";
      // Let the next surface that opens ask again rather than serving
      // this failure for the rest of the page session.
      snapshotPromise = null;
    }
    return snapshot;
  })().catch((error) => {
    // A failed config load is not cached either: the next mount retries.
    snapshotPromise = null;
    throw error;
  });
  return snapshotPromise;
}

export interface LocalizedPlanPrices {
  config: PaddlePublicConfig | null;
  paddle: Paddle | null;
  loading: boolean;
  /** The public config (or Paddle.js itself) could not be loaded. */
  configError: string | null;
  /** The price preview — or a checkout payment — failed. */
  pricesError: string | null;
  setPricesError: Dispatch<SetStateAction<string | null>>;
  /** Paddle's formatted localized total, when it has answered. */
  localizedPrice: (slug: PlanSlug, interval: BillingInterval) => string | undefined;
  /** The localized total, or the USD base price labelled "USD". */
  displayPrice: (slug: PlanSlug, interval: BillingInterval) => string;
  /** The yearly saving line, in whichever currency displayPrice is in. */
  annualSavingLine: (slug: PlanSlug) => string;
}

/**
 * @param enabled Pass false to keep Paddle unloaded until the surface
 *   is actually shown (the membership window does this until opened).
 */
export function useLocalizedPlanPrices(enabled = true): LocalizedPlanPrices {
  const [snapshot, setSnapshot] = useState<PaddlePriceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    loadPaddlePriceSnapshot()
      .then((loaded) => {
        if (!active) return;
        setSnapshot(loaded);
        setPricesError(loaded.pricesError);
      })
      .catch((error) => {
        if (active) setConfigError((error as Error)?.message || "Pricing could not be loaded. Check your connection and refresh.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [enabled]);

  const priceIdFor = (slug: PlanSlug, interval: BillingInterval): string | undefined => {
    const tier = snapshot?.config.tiers.find((candidate) => candidate.id === slug);
    return interval === "monthly" ? tier?.priceId.month : tier?.priceId.year;
  };

  const localizedPrice = (slug: PlanSlug, interval: BillingInterval): string | undefined => {
    const priceId = priceIdFor(slug, interval);
    return priceId ? snapshot?.formattedByPriceId[priceId] : undefined;
  };

  const displayPrice = (slug: PlanSlug, interval: BillingInterval): string =>
    localizedPrice(slug, interval) || formatBasePrice(PLAN_CONFIG[slug].prices[interval]);

  const annualSavingLine = (slug: PlanSlug): string => {
    const monthlyId = priceIdFor(slug, "monthly");
    const yearlyId = priceIdFor(slug, "yearly");
    const monthlyMinor = monthlyId ? snapshot?.minorTotalsByPriceId[monthlyId] : undefined;
    const yearlyMinor = yearlyId ? snapshot?.minorTotalsByPriceId[yearlyId] : undefined;
    if (monthlyMinor !== undefined && yearlyMinor !== undefined && snapshot?.currencyCode) {
      const localized = annualSavingFromMinorTotals(monthlyMinor, yearlyMinor, snapshot.currencyCode);
      if (localized) return localized.line;
    }
    return annualSavingFromBasePrices(slug).line;
  };

  return {
    config: snapshot?.config ?? null,
    paddle: snapshot?.paddle ?? null,
    loading,
    configError,
    pricesError,
    setPricesError,
    localizedPrice,
    displayPrice,
    annualSavingLine,
  };
}
