import { initializePaddle, type Paddle, type PaddleEventData } from "@paddle/paddle-js";

/** Exactly the values Paddle.js accepts — nothing is inferred. */
export type PaddleClientEnvironment = "sandbox" | "production";

/** The public billing configuration served by /api/billing/public-config. */
export interface PaddlePublicConfig {
  environment: PaddleClientEnvironment;
  /** Client-side token (live_… or test_…). Public by design. */
  clientToken: string;
  /** Visitor's country from the edge, or null when unknown. */
  country: string | null;
  tiers: import("../config/pricing-tiers").Tier[];
}

let initialised: Promise<Paddle | null> | null = null;
const eventListeners = new Set<(event: PaddleEventData) => void>();

export function onPaddleCheckoutEvent(listener: (event: PaddleEventData) => void): () => void {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

/**
 * Loads Paddle.js once per page and resolves with the instance Checkout
 * and PricePreview are called on.
 *
 * Fails loudly rather than defaulting: a missing token, a token whose
 * prefix (`test_` vs `live_`) disagrees with `environment`, or an
 * environment that is not exactly "sandbox" or "production" throws,
 * because a quiet fallback would open checkout against the wrong
 * Paddle account. An initialisation failure resolves to null so the
 * UI can say so instead of throwing on every click.
 */
export function loadPaddle(config: Pick<PaddlePublicConfig, "clientToken" | "environment">): Promise<Paddle | null> {
  if (!config.clientToken) throw new Error("Paddle client token is missing — set PADDLE_CLIENT_TOKEN.");
  if (config.environment !== "sandbox" && config.environment !== "production") {
    throw new Error(`Paddle client environment must be "sandbox" or "production", got "${String(config.environment)}".`);
  }
  if (config.environment === "sandbox" && !config.clientToken.startsWith("test_")) {
    throw new Error("Paddle sandbox environment requires a test_-prefixed PADDLE_CLIENT_TOKEN.");
  }
  if (config.environment === "production" && !config.clientToken.startsWith("live_")) {
    throw new Error("Paddle production environment requires a live_-prefixed PADDLE_CLIENT_TOKEN.");
  }
  initialised ??= initializePaddle({
    token: config.clientToken,
    environment: config.environment,
    eventCallback: (event) => {
      for (const listener of eventListeners) {
        try {
          listener(event);
        } catch (err) {
          console.error("[paddle] checkout event listener threw", err);
        }
      }
    },
  })
    .then((paddle) => paddle ?? null)
    .catch((error) => {
      console.error("[paddle] Paddle.js failed to initialise", error);
      return null;
    });
  return initialised;
}
