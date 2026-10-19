/**
 * FastSpring Store Builder Library (`sbl.min.js`) — popup checkout.
 *
 * The server says which product to sell and tags the session with the
 * signed-in account (`/api/billing/fastspring/checkout/:plan/:interval`
 * answers with a `popup` payload); this module loads FastSpring's builder
 * once per page and opens the tagged popup. The tags ride the session into
 * FastSpring exactly as they do on a server-created session, so the webhook
 * on the other side can always say whose account paid.
 *
 * Nothing here holds a FastSpring secret: the Store Builder Library is the
 * public storefront snippet, and the only inputs are the storefront path and
 * the product to put in the cart.
 */

export interface FastSpringPopupCheckout {
  /** Storefront path, e.g. `scenering.test.onfastspring.com/popup-scenering`. */
  storefront: string;
  /** Product path, e.g. `sceneflow-monthly`. */
  productPath: string;
  /** Order tags: `user_id` and `email`, read back on every webhook. */
  tags: Record<string, string>;
  /** Buyer email to prefill at checkout. */
  email?: string;
}

/** The Store Builder Library loader FastSpring publishes for popup checkouts. */
export const FASTSPRING_SBL_URL = "https://sbl.onfastspring.com/sbl/1.0.6/fastspring-builder.min.js";

declare global {
  interface Window {
    fscSession?: Record<string, unknown>;
    fastspring?: {
      builder?: {
        push?: (session: Record<string, unknown>) => void;
        tag?: (tags: Record<string, string>) => void;
        add?: (path: string, quantity?: number) => void;
        checkout?: (sessionId?: string) => void;
        showCheckout?: () => void;
        reset?: () => void;
      };
    };
  }
}

const SCRIPT_ID = "fsc-api";

/** Set when the snippet itself fails to load, so every waiter fails fast. */
let scriptLoadError: Error | null = null;

function builderReady(): Promise<NonNullable<NonNullable<Window["fastspring"]>["builder"]>> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const poll = () => {
      if (scriptLoadError) return reject(scriptLoadError);
      const builder = window.fastspring?.builder;
      if (builder?.push && (builder.checkout || builder.showCheckout)) return resolve(builder);
      if (Date.now() > deadline) {
        return reject(new Error("FastSpring checkout could not load. Check your connection and try again."));
      }
      window.setTimeout(poll, 100);
    };
    poll();
  });
}

/**
 * Loads the Store Builder Library for one storefront and resolves with its
 * `builder`. The script tag is the snippet FastSpring publishes
 * (`id="fsc-api"`, `data-storefront`); a second call with the same storefront
 * reuses the first script.
 */
export function loadFastSpringBuilder(storefront: string): Promise<NonNullable<NonNullable<Window["fastspring"]>["builder"]>> {
  if (!storefront) return Promise.reject(new Error("FastSpring checkout is not configured yet."));
  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (!existing) {
    scriptLoadError = null;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = FASTSPRING_SBL_URL;
    script.type = "text/javascript";
    script.async = true;
    script.setAttribute("data-storefront", storefront);
    script.onerror = () => {
      script.remove();
      scriptLoadError = new Error("FastSpring checkout could not load. Check your connection and try again.");
    };
    document.head.appendChild(script);
  } else if (existing.getAttribute("data-storefront") !== storefront) {
    // A different storefront (test after live, or the other popup) needs a
    // fresh snippet — the builder binds to one storefront at load time.
    existing.remove();
    window.fastspring = undefined;
    return loadFastSpringBuilder(storefront);
  }
  return builderReady();
}

/**
 * Opens the FastSpring popup checkout with one product in the cart and the
 * account tags on the session.
 *
 * `fscSession` seeds the session before the builder loads (FastSpring's
 * documented pre-load hook); `push()` then sets it explicitly once the
 * builder is up, with `reset: true` so a previous attempt's cart cannot leak
 * into this one. `tag()` is called as well as `push({ tags })` because the
 * order-level tags are what every webhook reads back.
 */
export async function openFastSpringPopup(checkout: FastSpringPopupCheckout): Promise<void> {
  const session = {
    reset: true,
    products: [{ path: checkout.productPath, quantity: 1 }],
    tags: checkout.tags,
    ...(checkout.email ? { paymentContact: { email: checkout.email } } : {}),
  };
  window.fscSession = session;
  const builder = await loadFastSpringBuilder(checkout.storefront);
  try {
    builder.push?.(session);
    builder.tag?.(checkout.tags);
    if (builder.checkout) builder.checkout();
    else builder.showCheckout?.();
  } catch (error) {
    throw new Error((error as Error)?.message || "FastSpring checkout could not be opened.");
  }
}
