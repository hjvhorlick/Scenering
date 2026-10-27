import { useEffect, useRef, useState } from "react";
import { ADSENSE_SCRIPT_ID, adsenseClientId, adsenseSlotId, type AdsenseSlotKind } from "./ads";

/**
 * One Google AdSense unit. Renders NOTHING — no box, no gap, no script — unless
 * the publisher id and this placement's slot are configured at build time (see
 * ./ads.ts). Callers decide audience and placement; this component only knows
 * how to load Google's script once and fill one unit.
 *
 * An empty ad box is the failure mode that matters here. Google answers every
 * request with `data-ad-status` on the <ins>: "filled" when an ad is there,
 * "unfilled" when it has nothing to show — a site still under review, a blocked
 * script, a visitor's ad blocker, a slot with no inventory. The label and the
 * reserved space used to be rendered unconditionally, so every one of those
 * cases left the word "Advertisement" over a blank band near the top of the
 * page. Now the label appears only with a real ad, and anything that comes back
 * unfilled — or never answers at all, which is what an ad blocker looks like —
 * removes itself completely, leaving no hole behind.
 *
 * The script loads lazily with the first mounted slot, straight from Google
 * to the visitor's browser: ads never touch the Scenering Worker. The
 * AdSense verification snippet pasted into index.html already loads the same
 * library — it carries no element id, as Google writes it — so before
 * injecting anything this checks the document for ANY adsbygoogle loader,
 * by id or by src: one loader per page, always.
 */

function ensureAdsenseScript(clientId: string): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(ADSENSE_SCRIPT_ID)) return;
  // The pasted verification snippet has no id, so the id check alone would
  // append a second loader next to it. Recognise the library by src too.
  if (document.querySelector('script[src*="adsbygoogle.js?client="]')) return;
  const script = document.createElement("script");
  script.id = ADSENSE_SCRIPT_ID;
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`;
  document.head.appendChild(script);
}

/**
 * How long the unit may sit in silence before it is treated as unfilled. An
 * ad blocker stops the script before it is even parsed, so nothing will ever
 * write `data-ad-status`; 4 s is long enough for a slow fill to beat it and
 * short enough that nobody studies a blank strip in the meantime.
 */
const UNFILLED_AFTER_MS = 4000;

type Fill = "pending" | "filled" | "unfilled";

export default function AdSlot({
  kind,
  className = "",
  style,
  testId,
}: {
  kind: AdsenseSlotKind;
  className?: string;
  style?: React.CSSProperties;
  testId?: string;
}) {
  // Outside Vite (SSR smoke tests, plain tsx) import.meta.env is undefined:
  // advertising must quietly stay off there, never throw.
  const env = (import.meta.env ?? {}) as unknown as Record<string, string | undefined>;
  const clientId = adsenseClientId(env);
  const slot = adsenseSlotId(env, kind);
  const pushed = useRef(false);
  const insRef = useRef<HTMLModElement>(null);
  const [fill, setFill] = useState<Fill>("pending");

  useEffect(() => {
    if (!clientId || !slot || pushed.current) return;
    pushed.current = true;
    ensureAdsenseScript(clientId);
    try {
      const queue = ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ||= []);
      queue.push({});
    } catch {
      // An ad blocker or a refused script must never break the page.
    }
  }, [clientId, slot]);

  // Watch the <ins> for Google's verdict. The attribute only ever appears
  // after the request, so anything still pending at the deadline — a blocked
  // script is the usual reason — is unfilled too.
  useEffect(() => {
    if (!clientId || !slot) return;
    const ins = insRef.current;
    if (!ins) return;

    const read = () => {
      const status = ins.getAttribute("data-ad-status");
      if (status === "filled") setFill("filled");
      else if (status === "unfilled") setFill("unfilled");
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
    const deadline = window.setTimeout(() => {
      setFill((current) => (current === "pending" ? "unfilled" : current));
    }, UNFILLED_AFTER_MS);

    return () => {
      observer.disconnect();
      window.clearTimeout(deadline);
    };
  }, [clientId, slot]);

  if (!clientId || !slot) return null;
  // Nothing to show: keep the page free of an empty advertising band.
  if (fill === "unfilled") return null;

  return (
    <div className={className} style={style} data-testid={testId} aria-label="Advertisement" data-ad-fill={fill}>
      {fill === "filled" ? (
        <span
          aria-hidden="true"
          style={{ display: "block", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.55, marginBottom: 4, textAlign: "center" }}
        >
          Advertisement
        </span>
      ) : null}
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client={clientId}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
