import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { loadFastSpringBuilder, onFastSpringData, type PublicBillingConfig } from "./fastspring";
import {
  annualSavingFromBasePrices,
  annualSavingFromMinorTotals,
  currencyFractionDigits,
  formatBasePrice,
} from "./localized-prices";
import { PLAN_CONFIG, type BillingInterval, type PlanSlug } from "../config/plans";

/**
 * One localized price for every surface.
 *
 * This hook is the single way any surface gets a price. It loads the public
 * billing config once per page (`/api/billing/public-config`), initialises the
 * FastSpring Store Builder Library (`sbl.min.js`) for the configured
 * storefront, and hands each component:
 *
 *   - displayPrice(slug, interval): the localized formatted total when
 *     FastSpring's Store Builder Library has answered, otherwise the USD base
 *     price labelled "USD" (see localized-prices.ts), and
 *   - annualSavingLine(slug): the per-month equivalent and saving in that
 *     same currency, computed from FastSpring's raw totals.
 *
 * The FastSpring catalogue prices themselves stay in USD; FastSpring's
 * automatic currency conversion turns them into the visitor's currency, both
 * here and in the checkout the visitor pays in. Nothing in this file converts
 * currency by hand.
 */

interface FastSpringPriceSnapshot {
  config: PublicBillingConfig;
  /** FastSpring's own display strings (`priceTotal`), by product path. */
  formattedByPriceId: Record<string, string>;
  /** Raw totals in the currency's lowest denomination, by product path. */
  minorTotalsByPriceId: Record<string, number>;
  /** The currency FastSpring previewed in, e.g. "ZAR" for South Africa. */
  currencyCode: string | null;
  pricesError: string | null;
}

let snapshotPromise: Promise<FastSpringPriceSnapshot> | null = null;

function extractFastSpringPrices(data: any, target: FastSpringPriceSnapshot): boolean {
  if (!data || typeof data !== "object") return false;
  const currency = typeof data.currency === "string" && data.currency.trim() ? data.currency.trim().toUpperCase() : target.currencyCode;
  const scale = 10 ** currencyFractionDigits(currency || "USD");
  let updated = false;

  const visitItem = (item: any) => {
    if (!item || typeof item !== "object") return;
    const path = String(item.path || item.product || "").trim();
    const formatted = String(item.priceTotal || item.total || item.price || item.unitPrice || "").trim();
    if (!path || !formatted) return;
    target.formattedByPriceId[path] = formatted;
    const rawNum = item.priceTotalValue ?? item.totalValue ?? item.priceValue ?? item.unitPriceValue;
    const numeric = typeof rawNum === "number" ? rawNum : Number(rawNum);
    if (Number.isFinite(numeric) && numeric >= 0) {
      target.minorTotalsByPriceId[path] = Math.round(numeric * scale);
    }
    updated = true;
  };

  if (Array.isArray(data.groups)) {
    for (const group of data.groups) {
      if (Array.isArray(group?.items)) {
        for (const item of group.items) visitItem(item);
      }
    }
  }
  if (Array.isArray(data.items)) {
    for (const item of data.items) visitItem(item);
  }
  if (updated && currency) {
    target.currencyCode = currency;
  }
  return updated;
}

function loadFastSpringPriceSnapshot(): Promise<FastSpringPriceSnapshot> {
  snapshotPromise ??= (async (): Promise<FastSpringPriceSnapshot> => {
    let ok = false;
    let data: PublicBillingConfig & { error?: string; detail?: string };
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
    const config: PublicBillingConfig = data;

    const snapshot: FastSpringPriceSnapshot = {
      config,
      formattedByPriceId: {},
      minorTotalsByPriceId: {},
      currencyCode: null,
      pricesError: null,
    };

    const productPaths = config.tiers
      .flatMap((tier) => [tier.priceId.month, tier.priceId.year])
      .filter(Boolean);
    if (!productPaths.length || !config.storefront || typeof document === "undefined") {
      return snapshot;
    }

    try {
      const builder = await loadFastSpringBuilder(config.storefront);
      builder.push?.({
        products: productPaths.map((path) => ({ path, quantity: 1 })),
        ...(config.country ? { country: config.country } : {}),
      });
    } catch {
      // SBL is optional for initial price display; USD base prices remain visible.
    }
    return snapshot;
  })().catch((error) => {
    // A failed config load is not cached: the next mount retries.
    snapshotPromise = null;
    throw error;
  });
  return snapshotPromise;
}

export interface LocalizedPlanPrices {
  config: PublicBillingConfig | null;
  loading: boolean;
  /** The public config could not be loaded. */
  configError: string | null;
  /** The price preview — or a checkout payment — failed. */
  pricesError: string | null;
  setPricesError: Dispatch<SetStateAction<string | null>>;
  /** FastSpring's formatted localized total, when it has answered. */
  localizedPrice: (slug: PlanSlug, interval: BillingInterval) => string | undefined;
  /** The localized total, or the USD base price labelled "USD". */
  displayPrice: (slug: PlanSlug, interval: BillingInterval) => string;
  /** The yearly saving line, in whichever currency displayPrice is in. */
  annualSavingLine: (slug: PlanSlug) => string;
}

/**
 * @param enabled Pass false to keep FastSpring unloaded until the surface
 *   is actually shown (the membership window does this until opened).
 */
export function useLocalizedPlanPrices(enabled = true): LocalizedPlanPrices {
  const [snapshot, setSnapshot] = useState<FastSpringPriceSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    const unsubscribeData = onFastSpringData((payload) => {
      if (!active || !snapshot) return;
      if (extractFastSpringPrices(payload, snapshot)) {
        setRevision((r) => r + 1);
      }
    });
    loadFastSpringPriceSnapshot()
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
      unsubscribeData();
    };
  }, [enabled, snapshot]);

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
    loading,
    configError,
    pricesError,
    setPricesError,
    localizedPrice,
    displayPrice,
    annualSavingLine,
  };
}
