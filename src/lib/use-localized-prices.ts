import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { annualSavingFromBasePrices, formatBasePrice } from "./localized-prices";
import { PLAN_CONFIG, type BillingInterval, type PlanSlug } from "../config/plans";
import type { PublicBillingConfig } from "./paypal-sdk";

/** One shape for the public billing payload; the checkout surfaces share it. */
export type { PublicBillingConfig };

let configPromise: Promise<PublicBillingConfig> | null = null;

function loadPublicBillingConfig(): Promise<PublicBillingConfig> {
  configPromise ??= fetch("/api/billing/public-config", { credentials: "same-origin" })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Billing configuration could not be loaded.");
      return data as PublicBillingConfig;
    })
    .catch((error) => {
      configPromise = null;
      throw error;
    });
  return configPromise;
}

export interface LocalizedPlanPrices {
  config: PublicBillingConfig | null;
  loading: boolean;
  configError: string | null;
  /** Retained for the pricing surfaces' existing error display. */
  pricesError: string | null;
  setPricesError: Dispatch<SetStateAction<string | null>>;
  /** Scenering subscriptions are priced in USD; no external localization SDK is loaded. */
  localizedPrice: (slug: PlanSlug, interval: BillingInterval) => string | undefined;
  displayPrice: (slug: PlanSlug, interval: BillingInterval) => string;
  annualSavingLine: (slug: PlanSlug) => string;
}

/** Load the public PayPal Sandbox plan catalogue only when this surface needs it. */
export function useLocalizedPlanPrices(enabled = true): LocalizedPlanPrices {
  const [config, setConfig] = useState<PublicBillingConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [pricesError, setPricesError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || config) return;
    let active = true;
    setLoading(true);
    loadPublicBillingConfig()
      .then((next) => { if (active) setConfig(next); })
      .catch((error) => { if (active) setConfigError((error as Error)?.message || "Billing configuration could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, config]);

  return {
    config,
    loading,
    configError,
    pricesError,
    setPricesError,
    localizedPrice: () => undefined,
    displayPrice: (slug, interval) => formatBasePrice(PLAN_CONFIG[slug].prices[interval]),
    annualSavingLine: (slug) => annualSavingFromBasePrices(slug).line,
  };
}
